"use client";

import Link from "next/link";

import { Honeypot, useSubmit } from "./use-submit";

export function NewsletterForm({ compact = false }: { compact?: boolean }) {
  const { state, submit } = useSubmit("/api/newsletter");
  const id = compact ? "newsletter-email-footer" : "newsletter-email";

  if (state.status === "success") {
    return <p className="text-sm text-success" role="status">{state.message ?? "Thanks — you're on the list."}</p>;
  }

  return (
    <form
      className="relative"
      noValidate={false}
      onSubmit={async (e) => {
        e.preventDefault();
        await submit(e.currentTarget);
      }}
    >
      <Honeypot />
      <label htmlFor={id} className="sr-only">Email address</label>
      <div className={compact ? "flex gap-2" : "flex flex-col gap-3 sm:flex-row"}>
        <input id={id} name="email" type="email" required autoComplete="email" placeholder="Email address" className="field min-w-0 flex-1" />
        <button type="submit" className={compact ? "btn-primary px-4" : "btn-primary"} disabled={state.status === "submitting"}>
          {state.status === "submitting" ? "Signing up…" : "Sign up"}
        </button>
      </div>
      {state.status === "error" && <p className="mt-2 text-[0.8125rem] text-danger" role="alert">{state.message}</p>}
      <p className="mt-2 text-xs text-muted">
        Unsubscribe at any time. See our <Link href="/privacy-policy" className="link">Privacy Policy</Link>.
      </p>
    </form>
  );
}
