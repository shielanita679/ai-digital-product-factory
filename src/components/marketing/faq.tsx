import { ChevronDown } from "lucide-react";

const faqs = [
  {
    question: "Do I get real, usable SVG files?",
    answer:
      "Yes. Vectorized designs contain genuine vector path data, not a renamed PNG — built for cutting machines like Cricut and Silhouette.",
  },
  {
    question: "Do I own the rights to what I generate?",
    answer:
      "Generated assets are original AI output intended for your commercial use, subject to the plan's license terms. You're responsible for reviewing designs before selling them.",
  },
  {
    question: "Which marketplaces can I sell on?",
    answer:
      "Anywhere digital products are sold — Etsy, Shopify, your own store, or other creative marketplaces. We don't publish directly to marketplaces on your behalf yet.",
  },
  {
    question: "What happens if a design fails to generate?",
    answer:
      "Failed generations don't consume your credits and can be retried individually without losing the rest of your project.",
  },
  {
    question: "Can I cancel or change plans anytime?",
    answer:
      "Yes. Plans are billed monthly and can be upgraded, downgraded, or cancelled at any time from your billing settings.",
  },
];

export function FAQ() {
  return (
    <section id="faq" className="scroll-mt-20 border-t border-border bg-muted/30">
      <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Frequently asked questions
          </h2>
        </div>

        <div className="mt-12 divide-y divide-border rounded-2xl border border-border bg-card">
          {faqs.map((faq) => (
            <details key={faq.question} className="group p-6">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-medium text-foreground">
                {faq.question}
                <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>
              <p className="mt-3 text-sm text-muted-foreground">
                {faq.answer}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
