"use client";

import Link from "next/link";

import { contactSubjects } from "@/config/contact";

import { Honeypot, UnavailableNotice, useSubmit } from "./use-submit";

export function ContactForm({ available, defaultSubject, defaultOrderNumber }: { available: boolean; defaultSubject?: string; defaultOrderNumber?: string }) {
  const { state, submit } = useSubmit("/api/contact");

  if (state.status === "success") {
    return (
      <div className="border border-line bg-surface p-6" role="status">
        <h2 className="font-serif text-2xl">Message sent</h2>
        <p className="mt-2 text-ink-2">{state.message}</p>
      </div>
    );
  }

  return (
    <form
      className="relative grid gap-5"
      aria-describedby={available ? undefined : "contact-unavailable"}
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        if (await submit(form)) form.reset();
      }}
    >
      <Honeypot />
      {!available && <UnavailableNotice id="contact-unavailable" />}
      <fieldset disabled={!available} className="contents">
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="c-name" className="field-label">Name</label>
          <input id="c-name" name="name" required maxLength={100} autoComplete="name" className="field" />
        </div>
        <div>
          <label htmlFor="c-email" className="field-label">Email</label>
          <input id="c-email" name="email" type="email" required maxLength={254} autoComplete="email" className="field" />
        </div>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="c-order" className="field-label">
            Order number <span className="font-normal text-muted">(optional)</span>
          </label>
          <input id="c-order" name="orderNumber" maxLength={40} defaultValue={defaultOrderNumber} className="field" />
        </div>
        <div>
          <label htmlFor="c-subject" className="field-label">Subject</label>
          <select id="c-subject" name="subject" required defaultValue={defaultSubject ?? ""} className="field appearance-none bg-[length:16px] bg-[right_0.75rem_center] bg-no-repeat pr-9" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%231d1c1a' stroke-width='1.5'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }}>
            <option value="" disabled>Choose a subject</option>
            {Object.entries(contactSubjects).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label htmlFor="c-message" className="field-label">Message</label>
        <textarea id="c-message" name="message" required minLength={10} maxLength={4000} rows={6} className="field resize-y" />
      </div>
      {state.status === "error" && <p className="text-sm text-danger" role="alert">{state.message}</p>}
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted">
          We use your details only to respond to this message. See our <Link href="/privacy-policy" className="link">Privacy Policy</Link>.
        </p>
        <button type="submit" className="btn-primary" disabled={state.status === "submitting"}>
          {state.status === "submitting" ? "Sending…" : "Send message"}
        </button>
      </div>
      </fieldset>
    </form>
  );
}
