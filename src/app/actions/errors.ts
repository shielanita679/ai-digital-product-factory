"use server";

import { ErrorReporter } from "@/lib/errors/error-reporter";

/**
 * The only bridge from a client-side error boundary (error.tsx/
 * global-error.tsx, which run in the browser and have no service-role
 * access) to ErrorReporter. Deliberately accepts only `message` and
 * Next.js's own `digest` — never a full client-side stack trace, which
 * can be large and is far less useful than the server-side stack
 * ErrorReporter already captures at the throw site for server errors.
 */
export async function reportClientErrorAction(message: string, digest?: string): Promise<void> {
  ErrorReporter.captureException(message, {
    route: "client-error-boundary",
    metadata: { digest: digest ?? null },
  });
}
