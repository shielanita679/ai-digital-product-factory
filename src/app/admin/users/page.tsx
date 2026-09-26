import type { Metadata } from "next";
import Link from "next/link";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listUsers } from "@/lib/admin/admin-service";
import { planLabel } from "@/config/plans";
import { subscriptionStatusLabel } from "@/config/subscription";

export const metadata: Metadata = { title: "Admin — Users" };

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { page: pageParam } = await searchParams;
  const page = Math.max(0, Number(pageParam ?? 0) || 0);
  const { users, hasMore } = await listUsers(page);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Users</h1>

      <Card>
        <CardContent className="p-0">
          <div className="divide-y divide-border">
            <div className="grid grid-cols-6 gap-3 px-4 py-2.5 text-xs font-medium text-muted-foreground">
              <span className="col-span-2">Email</span>
              <span>Signed up</span>
              <span>Onboarding</span>
              <span>Plan / status</span>
              <span>Credits</span>
            </div>
            {users.map((u) => (
              <div key={u.id} className="grid grid-cols-6 gap-3 px-4 py-3 text-sm">
                <span className="col-span-2 truncate" title={u.id}>
                  {u.email}
                </span>
                <span className="text-muted-foreground">{formatDate(u.createdAt)}</span>
                <span>
                  <Badge variant={u.onboardingCompleted ? "success" : "outline"}>
                    {u.onboardingCompleted ? "Complete" : "Incomplete"}
                  </Badge>
                </span>
                <span className="flex flex-col gap-1">
                  <span>{planLabel(u.planId)}</span>
                  {u.subscriptionStatus && (
                    <span className="text-xs text-muted-foreground">{subscriptionStatusLabel(u.subscriptionStatus)}</span>
                  )}
                </span>
                <span>{u.creditBalance ?? "—"}</span>
              </div>
            ))}
            {users.length === 0 && <p className="px-4 py-6 text-sm text-muted-foreground">No users found.</p>}
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-between">
        {page === 0 ? (
          <Button variant="outline" disabled>
            Previous
          </Button>
        ) : (
          <Button variant="outline" asChild>
            <Link href={`/admin/users?page=${page - 1}`}>Previous</Link>
          </Button>
        )}
        {!hasMore ? (
          <Button variant="outline" disabled>
            Next
          </Button>
        ) : (
          <Button variant="outline" asChild>
            <Link href={`/admin/users?page=${page + 1}`}>Next</Link>
          </Button>
        )}
      </div>
    </div>
  );
}
