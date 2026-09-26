"use client";

import * as React from "react";

import { reportClientErrorAction } from "@/app/actions/errors";

/**
 * Root-level fallback — only triggers if an error escapes the normal
 * error.tsx boundary (e.g. an error in the root layout itself), so it
 * must render its own <html>/<body> and stays deliberately minimal (no
 * design-system imports, since the layout that provides them may be what
 * failed).
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  React.useEffect(() => {
    void reportClientErrorAction(error.message, error.digest).catch(() => {});
  }, [error]);

  return (
    <html lang="en">
      <body style={{ display: "flex", minHeight: "100vh", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "system-ui, sans-serif", gap: "1rem" }}>
        <p>Something went wrong.</p>
        <button type="button" onClick={reset} style={{ padding: "0.5rem 1rem", borderRadius: "0.5rem", border: "1px solid #ccc" }}>
          Try again
        </button>
      </body>
    </html>
  );
}
