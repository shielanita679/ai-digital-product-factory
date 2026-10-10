"use client";

import Link from "next/link";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="page-x max-w-2xl py-20 sm:py-28">
      <h1 className="text-4xl">Something went wrong</h1>
      <p className="mt-4 text-ink-2">This page couldn&rsquo;t be loaded. Please try again. If the problem continues, contact us and let us know what you were doing.</p>
      <div className="mt-8 flex flex-wrap gap-3">
        <button type="button" onClick={reset} className="btn-primary">Try again</button>
        <Link href="/" className="btn-ghost">Go to home page</Link>
      </div>
    </div>
  );
}
