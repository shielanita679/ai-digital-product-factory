import type { Metadata } from "next";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getSystemInfo, getAnalyticsSummary } from "@/lib/admin/admin-service";

export const metadata: Metadata = { title: "Admin — System" };

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default async function AdminSystemPage() {
  const [system, analytics] = await Promise.all([getSystemInfo(), getAnalyticsSummary()]);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">System</h1>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Provider modes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span>AI image</span>
              <Badge variant={system.providerModes.aiImage === "mock" ? "outline" : "success"}>{system.providerModes.aiImage}</Badge>
            </div>
            <div className="flex justify-between">
              <span>Vector</span>
              <Badge variant={system.providerModes.vector === "mock" ? "outline" : "success"}>{system.providerModes.vector}</Badge>
            </div>
            <div className="flex justify-between">
              <span>Mockup</span>
              <Badge variant={system.providerModes.mockup === "mock" ? "outline" : "success"}>{system.providerModes.mockup}</Badge>
            </div>
            <div className="flex justify-between">
              <span>AI text</span>
              <Badge variant={system.providerModes.aiText === "mock" ? "outline" : "success"}>{system.providerModes.aiText}</Badge>
            </div>
            <div className="mt-2 flex justify-between border-t border-border pt-2">
              <span>Stripe</span>
              <Badge variant={system.stripeMode === "test" ? "success" : system.stripeMode === "live" ? "outline" : "outline"}>
                {system.stripeMode === "test" ? "TEST MODE" : system.stripeMode === "live" ? "LIVE MODE" : "Not configured"}
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Platform totals</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span>Users</span>
              <span className="font-medium">{analytics.totalUsers}</span>
            </div>
            <div className="flex justify-between">
              <span>Onboarded</span>
              <span className="font-medium">{analytics.onboardedUsers}</span>
            </div>
            <div className="flex justify-between">
              <span>Projects</span>
              <span className="font-medium">{analytics.totalProjects}</span>
            </div>
            <div className="flex justify-between">
              <span>Generations</span>
              <span className="font-medium">{analytics.totalGenerations}</span>
            </div>
            <div className="flex justify-between">
              <span>Packages built</span>
              <span className="font-medium">{analytics.totalPackages}</span>
            </div>
            <div className="flex justify-between">
              <span>Downloads</span>
              <span className="font-medium">{analytics.totalDownloads}</span>
            </div>
            <div className="flex justify-between">
              <span>Active subscriptions</span>
              <span className="font-medium">{analytics.activeSubscriptions}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent application errors</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5 text-sm">
          {system.recentErrors.map((err) => (
            <div key={err.id} className="rounded-lg border border-border p-2 text-xs">
              <div className="flex items-center gap-2">
                <Badge variant={err.level === "exception" ? "outline" : "secondary"}>{err.level}</Badge>
                {err.route && <span className="text-muted-foreground">{err.route}</span>}
                <span className="ml-auto text-muted-foreground">{formatDate(err.createdAt)}</span>
              </div>
              <p className="mt-1">{err.message}</p>
            </div>
          ))}
          {system.recentErrors.length === 0 && <p className="text-muted-foreground">No errors logged yet.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
