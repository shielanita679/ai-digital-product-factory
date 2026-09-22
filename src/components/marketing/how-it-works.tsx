const steps = [
  {
    number: "01",
    title: "Describe your product",
    description:
      "Tell us what you want to create — e.g. “20 funny Halloween cat SVGs for Cricut.”",
  },
  {
    number: "02",
    title: "AI creates your collection",
    description:
      "The prompt engine expands your idea into distinct, structured designs and generates artwork for each.",
  },
  {
    number: "03",
    title: "Review and edit designs",
    description:
      "Regenerate, create variations, or fine-tune any design until the collection feels right.",
  },
  {
    number: "04",
    title: "Generate mockups and listing",
    description:
      "Turn selected designs into product mockups plus a ready-to-edit listing: title, tags, and pricing.",
  },
  {
    number: "05",
    title: "Download the complete package",
    description:
      "Get an organized ZIP with SVGs, PNGs, mockups, license, and listing copy — ready to publish.",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-20">
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            From idea to product in five steps
          </h2>
          <p className="mt-4 text-muted-foreground">
            A guided wizard walks you through the entire workflow — no
            separate tools required.
          </p>
        </div>

        <ol className="mx-auto mt-14 grid max-w-4xl gap-6 sm:grid-cols-2">
          {steps.map((step) => (
            <li
              key={step.number}
              className="relative rounded-2xl border border-border bg-card p-6"
            >
              <span className="text-sm font-semibold text-brand-gradient">
                {step.number}
              </span>
              <h3 className="mt-2 text-base font-semibold">{step.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {step.description}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
