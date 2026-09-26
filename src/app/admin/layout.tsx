import { requireAdmin } from "@/lib/auth/admin";
import { AdminShell } from "@/components/admin/admin-shell";

/**
 * The real authorization boundary for every /admin/* route — requireAdmin()
 * re-reads profiles.role from the database on every request (never cached,
 * never trusted from client state). A hidden nav link is not a substitute
 * for this: this layout renders NOTHING for a non-admin — requireAdmin()
 * redirects them to /dashboard before any admin content is produced.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();

  return <AdminShell>{children}</AdminShell>;
}
