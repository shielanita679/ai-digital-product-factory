import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { PLAN_VALUES, PURCHASABLE_PLAN_VALUES } from "@/config/plans";
import { SUBSCRIPTION_STATUS_VALUES } from "@/config/subscription";

/**
 * All cross-user admin reads live here, and ONLY here — every exported
 * function uses a service-role client (bypassing RLS by design, the same
 * deliberate narrow bypass category documented in
 * src/lib/supabase/service-role.ts's own doc comment). Callers MUST have
 * already passed src/lib/auth/admin.ts's requireAdmin()/assertAdmin()
 * before calling anything here — this module itself does not re-check
 * authorization, by design (it has no request/session context of its
 * own); it is only ever reached from an /admin/* page or an admin-only
 * Server Action, both of which gate first.
 *
 * Every query here is bounded (a `.range()`/`.limit()` or a
 * `count: "exact", head: true` count-only query) — never an unbounded
 * `.select("*")` across a whole table, per the Phase 12 spec's "avoid
 * expensive unbounded admin queries."
 */

const PAGE_SIZE = 25;

export type AdminUserRow = {
  id: string;
  email: string;
  createdAt: string;
  onboardingCompleted: boolean;
  planId: string;
  subscriptionStatus: string | null;
  creditBalance: number | null;
};

export async function listUsers(page = 0): Promise<{ users: AdminUserRow[]; hasMore: boolean }> {
  const supabase = createServiceRoleClient();
  const from = page * PAGE_SIZE;
  const to = from + PAGE_SIZE; // one extra row to detect hasMore without a second count query

  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, email, created_at, onboarding_completed")
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error || !profiles) {
    return { users: [], hasMore: false };
  }

  const hasMore = profiles.length > PAGE_SIZE;
  const pageRows = profiles.slice(0, PAGE_SIZE);
  const ids = pageRows.map((p) => p.id);

  const [{ data: subscriptions }, { data: creditAccounts }] = await Promise.all([
    ids.length
      ? supabase.from("subscriptions").select("user_id, plan_key, status").in("user_id", ids)
      : Promise.resolve({ data: [] as { user_id: string; plan_key: string; status: string }[] }),
    ids.length
      ? supabase.from("credit_accounts").select("user_id, balance").in("user_id", ids)
      : Promise.resolve({ data: [] as { user_id: string; balance: number }[] }),
  ]);

  const subscriptionByUser = new Map((subscriptions ?? []).map((s) => [s.user_id, s]));
  const creditByUser = new Map((creditAccounts ?? []).map((c) => [c.user_id, c.balance]));

  const users: AdminUserRow[] = pageRows.map((p) => {
    const sub = subscriptionByUser.get(p.id);
    return {
      id: p.id,
      email: p.email,
      createdAt: p.created_at,
      onboardingCompleted: p.onboarding_completed,
      planId: sub?.plan_key ?? "free",
      subscriptionStatus: sub?.status ?? null,
      creditBalance: creditByUser.get(p.id) ?? null,
    };
  });

  return { users, hasMore };
}

export type AdminProjectRow = {
  id: string;
  name: string;
  ownerId: string;
  ownerEmail: string | null;
  status: string;
  designCount: number;
  createdAt: string;
};

export async function listProjects(page = 0): Promise<{ projects: AdminProjectRow[]; hasMore: boolean }> {
  const supabase = createServiceRoleClient();
  const from = page * PAGE_SIZE;
  const to = from + PAGE_SIZE;

  const { data: projects, error } = await supabase
    .from("projects")
    .select("id, name, user_id, status, design_count, created_at")
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error || !projects) {
    return { projects: [], hasMore: false };
  }

  const hasMore = projects.length > PAGE_SIZE;
  const pageRows = projects.slice(0, PAGE_SIZE);
  const ownerIds = [...new Set(pageRows.map((p) => p.user_id))];

  const { data: owners } = ownerIds.length
    ? await supabase.from("profiles").select("id, email").in("id", ownerIds)
    : { data: [] as { id: string; email: string }[] };

  const emailById = new Map((owners ?? []).map((o) => [o.id, o.email]));

  return {
    projects: pageRows.map((p) => ({
      id: p.id,
      name: p.name,
      ownerId: p.user_id,
      ownerEmail: emailById.get(p.user_id) ?? null,
      status: p.status,
      designCount: p.design_count,
      createdAt: p.created_at,
    })),
    hasMore,
  };
}

export type AdminBillingSummary = {
  subscriptionCountByPlan: Record<string, number>;
  subscriptionCountByStatus: Record<string, number>;
  recentLedgerEntries: { id: string; userId: string; amount: number; entryType: string; reason: string; createdAt: string }[];
  webhookEventCountByStatus: Record<string, number>;
  recentFailedWebhooks: { stripeEventId: string; eventType: string; errorMessage: string | null; createdAt: string }[];
};

async function boundedCount(
  supabase: ReturnType<typeof createServiceRoleClient>,
  table: "subscriptions" | "stripe_webhook_events",
  column: string,
  value: string,
): Promise<number> {
  const { count } = await supabase.from(table).select("*", { count: "exact", head: true }).eq(column, value);
  return count ?? 0;
}

export async function getBillingSummary(): Promise<AdminBillingSummary> {
  const supabase = createServiceRoleClient();

  const [planCounts, statusCounts, webhookStatusCounts, ledgerResult, failedWebhooksResult] = await Promise.all([
    Promise.all(PURCHASABLE_PLAN_VALUES.map(async (plan) => [plan, await boundedCount(supabase, "subscriptions", "plan_key", plan)] as const)),
    Promise.all(SUBSCRIPTION_STATUS_VALUES.map(async (status) => [status, await boundedCount(supabase, "subscriptions", "status", status)] as const)),
    Promise.all((["processing", "processed", "failed"] as const).map(async (status) => [status, await boundedCount(supabase, "stripe_webhook_events", "status", status)] as const)),
    supabase
      .from("credit_ledger")
      .select("id, user_id, amount, entry_type, reason, created_at")
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("stripe_webhook_events")
      .select("stripe_event_id, event_type, error_message, created_at")
      .eq("status", "failed")
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  return {
    subscriptionCountByPlan: Object.fromEntries(planCounts),
    subscriptionCountByStatus: Object.fromEntries(statusCounts),
    recentLedgerEntries: (ledgerResult.data ?? []).map((e) => ({
      id: e.id,
      userId: e.user_id,
      amount: e.amount,
      entryType: e.entry_type,
      reason: e.reason,
      createdAt: e.created_at,
    })),
    webhookEventCountByStatus: Object.fromEntries(webhookStatusCounts),
    recentFailedWebhooks: (failedWebhooksResult.data ?? []).map((w) => ({
      stripeEventId: w.stripe_event_id,
      eventType: w.event_type,
      errorMessage: w.error_message,
      createdAt: w.created_at,
    })),
  };
}

export type AdminAnalyticsSummary = {
  totalUsers: number;
  onboardedUsers: number;
  totalProjects: number;
  totalGenerations: number;
  totalPackages: number;
  totalDownloads: number;
  activeSubscriptions: number;
  planDistribution: Record<string, number>;
};

export async function getAnalyticsSummary(): Promise<AdminAnalyticsSummary> {
  const supabase = createServiceRoleClient();

  const [
    { count: totalUsers },
    { count: onboardedUsers },
    { count: totalProjects },
    { count: totalGenerations },
    { count: totalPackages },
    { count: totalDownloads },
    { count: activeSubscriptions },
    { count: totalSubscriptions },
    planCounts,
  ] = await Promise.all([
    supabase.from("profiles").select("*", { count: "exact", head: true }),
    supabase.from("profiles").select("*", { count: "exact", head: true }).eq("onboarding_completed", true),
    supabase.from("projects").select("*", { count: "exact", head: true }),
    supabase.from("generation_jobs").select("*", { count: "exact", head: true }),
    supabase.from("product_packages").select("*", { count: "exact", head: true }),
    supabase.from("analytics_events").select("*", { count: "exact", head: true }).eq("event_name", "package_downloaded"),
    supabase.from("subscriptions").select("*", { count: "exact", head: true }).in("status", ["active", "trialing"]),
    supabase.from("subscriptions").select("*", { count: "exact", head: true }),
    Promise.all(PURCHASABLE_PLAN_VALUES.map(async (plan) => [plan, await boundedCount(supabase, "subscriptions", "plan_key", plan)] as const)),
  ]);

  const planDistribution: Record<string, number> = Object.fromEntries(planCounts);
  planDistribution.free = Math.max(0, (totalUsers ?? 0) - (totalSubscriptions ?? 0));

  return {
    totalUsers: totalUsers ?? 0,
    onboardedUsers: onboardedUsers ?? 0,
    totalProjects: totalProjects ?? 0,
    totalGenerations: totalGenerations ?? 0,
    totalPackages: totalPackages ?? 0,
    totalDownloads: totalDownloads ?? 0,
    activeSubscriptions: activeSubscriptions ?? 0,
    planDistribution,
  };
}

export type AdminSystemInfo = {
  providerModes: { aiImage: string; vector: string; mockup: string; aiText: string };
  stripeMode: "test" | "live" | "not_configured";
  recentErrors: { id: string; level: string; message: string; route: string | null; createdAt: string }[];
};

/** Never returns the secret key itself — only a derived "test"/"live"/"not_configured" label. */
function deriveStripeMode(): "test" | "live" | "not_configured" {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) return "not_configured";
  if (key.startsWith("sk_test_") || key.startsWith("rk_test_")) return "test";
  return "live";
}

export async function getSystemInfo(): Promise<AdminSystemInfo> {
  const supabase = createServiceRoleClient();

  const { data: errors } = await supabase
    .from("application_errors")
    .select("id, level, message, route, created_at")
    .order("created_at", { ascending: false })
    .limit(25);

  return {
    providerModes: {
      aiImage: process.env.AI_IMAGE_PROVIDER?.trim() || "mock",
      vector: process.env.VECTOR_PROVIDER?.trim() || "mock",
      mockup: process.env.MOCKUP_PROVIDER?.trim() || "mock",
      aiText: process.env.AI_TEXT_PROVIDER?.trim() || "mock",
    },
    stripeMode: deriveStripeMode(),
    recentErrors: (errors ?? []).map((e) => ({
      id: e.id,
      level: e.level,
      message: e.message,
      route: e.route,
      createdAt: e.created_at,
    })),
  };
}

/** Re-exported so admin pages/tests never need to hard-code the full plan list. */
export const ALL_PLAN_VALUES = PLAN_VALUES;
