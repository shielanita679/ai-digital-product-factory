"use client";

import { useState } from "react";

export type SubmitState = { status: "idle" | "submitting" | "success" | "error"; message?: string; data?: unknown };

/** Posts a form as JSON to an internal API route and tracks the result. */
export function useSubmit(endpoint: string) {
  const [state, setState] = useState<SubmitState>({ status: "idle" });

  async function submit(form: HTMLFormElement): Promise<boolean> {
    setState({ status: "submitting" });
    const data = Object.fromEntries(new FormData(form).entries());
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; message?: string; data?: unknown };
      if (!res.ok || !json.ok) {
        setState({ status: "error", message: json.error ?? "Something went wrong. Please try again." });
        return false;
      }
      setState({ status: "success", message: json.message, data: json.data });
      return true;
    } catch {
      setState({ status: "error", message: "We couldn't reach the server. Check your connection and try again." });
      return false;
    }
  }

  return { state, submit };
}

/** Off-screen field that bots fill in and people don't. */
export function Honeypot() {
  return (
    <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
      <label>
        Company
        <input type="text" name="company" tabIndex={-1} autoComplete="off" defaultValue="" />
      </label>
    </div>
  );
}

/** Shown in place of a working form while message delivery isn't configured. */
export function UnavailableNotice({ id }: { id: string }) {
  return (
    <p id={id} role="status" className="border border-notice-ink/20 bg-notice p-4 text-sm text-notice-ink">
      This form isn&rsquo;t accepting messages yet. Please check back soon.
    </p>
  );
}
