import { DatabaseZap } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function SupabaseSetupNotice() {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <Card className="max-w-md">
        <CardHeader>
          <span className="mb-2 flex size-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
            <DatabaseZap className="size-5" />
          </span>
          <CardTitle>Supabase isn&apos;t configured yet</CardTitle>
          <CardDescription>
            This route needs a Supabase project to authenticate users.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Add <code className="rounded bg-muted px-1 py-0.5 text-foreground">NEXT_PUBLIC_SUPABASE_URL</code>{" "}
            and{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-foreground">
              NEXT_PUBLIC_SUPABASE_ANON_KEY
            </code>{" "}
            to <code className="rounded bg-muted px-1 py-0.5 text-foreground">.env.local</code>{" "}
            (see <code className="rounded bg-muted px-1 py-0.5 text-foreground">.env.example</code>),
            then restart the dev server.
          </p>
          <p>See <code className="rounded bg-muted px-1 py-0.5 text-foreground">supabase/README.md</code> for the full setup guide.</p>
        </CardContent>
      </Card>
    </div>
  );
}
