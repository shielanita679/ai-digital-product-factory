import type { Metadata } from "next";
import Link from "next/link";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listProjects } from "@/lib/admin/admin-service";

export const metadata: Metadata = { title: "Admin — Projects" };

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default async function AdminProjectsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { page: pageParam } = await searchParams;
  const page = Math.max(0, Number(pageParam ?? 0) || 0);
  const { projects, hasMore } = await listProjects(page);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Projects</h1>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <div className="min-w-[720px] divide-y divide-border">
              <div className="grid grid-cols-6 gap-3 px-4 py-2.5 text-xs font-medium text-muted-foreground">
                <span className="col-span-2">Name</span>
                <span>Owner</span>
                <span>Status</span>
                <span>Designs</span>
                <span>Created</span>
              </div>
              {projects.map((p) => (
                <div key={p.id} className="grid grid-cols-6 gap-3 px-4 py-3 text-sm">
                  <span className="col-span-2 truncate">{p.name}</span>
                  <span className="truncate text-muted-foreground" title={p.ownerId}>
                    {p.ownerEmail ?? p.ownerId}
                  </span>
                  <span>
                    <Badge variant="outline">{p.status}</Badge>
                  </span>
                  <span>{p.designCount}</span>
                  <span className="text-muted-foreground">{formatDate(p.createdAt)}</span>
                </div>
              ))}
              {projects.length === 0 && <p className="px-4 py-6 text-sm text-muted-foreground">No projects found.</p>}
            </div>
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
            <Link href={`/admin/projects?page=${page - 1}`}>Previous</Link>
          </Button>
        )}
        {!hasMore ? (
          <Button variant="outline" disabled>
            Next
          </Button>
        ) : (
          <Button variant="outline" asChild>
            <Link href={`/admin/projects?page=${page + 1}`}>Next</Link>
          </Button>
        )}
      </div>
    </div>
  );
}
