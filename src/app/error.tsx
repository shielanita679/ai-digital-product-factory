"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { reportClientErrorAction } from "@/app/actions/errors";

/**
 * Next.js route-segment error boundary. Reports through the
 * reportClientErrorAction bridge (client components have no service-role
 * access) — best-effort, never blocks rendering the fallback UI even if
 * reporting itself fails.
 */
export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  React.useEffect(() => {
    void reportClientErrorAction(error.message, error.digest).catch(() => {});
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <span className="mb-2 flex size-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
            <AlertTriangle className="size-6" />
          </span>
          <CardTitle className="text-xl">Something went wrong</CardTitle>
          <CardDescription>We&apos;ve logged this and will look into it. You can try again.</CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          <Button variant="brand" onClick={reset}>
            Try again
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
