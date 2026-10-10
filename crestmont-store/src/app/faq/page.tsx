import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { Setting } from "@/components/setting";
import { business } from "@/config/business";
import { commerce } from "@/config/commerce";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "FAQ",
  description: `Answers to common questions about ordering, payment, shipping and returns at ${business.brandName}.`,
  path: "/faq",
});

type QA = { q: string; a: React.ReactNode };

export default function FaqPage() {
  const r = commerce.returns;
  const groups: { title: string; items: QA[] }[] = [
    {
      title: "Ordering",
      items: [
        {
          q: "Do I need an account to order?",
          a: <>No. We offer guest checkout. Your order confirmation and receipt are emailed to the address you enter at checkout.</>,
        },
        {
          q: "Can I change or cancel my order?",
          a: (
            <>
              Contact us as soon as possible with your order number. We can usually make changes or cancel <Setting value={commerce.orderChangeWindow} label="order change window" />. Once an order has shipped it can&rsquo;t be changed, but it may be eligible for a return. See <Link href="/shipping-policy#order-changes">order changes</Link>.
            </>
          ),
        },
        {
          q: "What does “Coming soon” mean?",
          a: <>The product is being prepared for launch and can&rsquo;t be ordered yet. Its full details and photography will be published on the product page before it goes on sale.</>,
        },
        {
          q: "Where can I find my order number?",
          a: <>It&rsquo;s shown on the confirmation page after payment and in your confirmation email. Order numbers start with &ldquo;CH-&rdquo;.</>,
        },
      ],
    },
    {
      title: "Payment",
      items: [
        {
          q: "Which payment methods do you accept?",
          a: <>The payment methods available for your order are shown on the secure checkout page. Availability can depend on your location and order. See our <Link href="/payment-policy">Payment Policy</Link>.</>,
        },
        {
          q: "Is it safe to enter my card details?",
          a: <>Card details are entered on our payment processor&rsquo;s hosted checkout page over an encrypted connection. They are not sent to or stored on our website.</>,
        },
        {
          q: "When will I be charged?",
          a: <>Your payment is taken when you confirm your order on the checkout page. Orders are processed only after payment is confirmed.</>,
        },
        {
          q: "Do you charge sales tax?",
          a: <>Where we are required to collect sales tax, it is calculated at checkout based on your shipping address and shown before you pay.</>,
        },
      ],
    },
    {
      title: "Shipping",
      items: [
        {
          q: "How long does it take to ship?",
          a: (
            <>
              Orders are prepared within <Setting value={commerce.processingTime} label="processing time" />. Domestic delivery typically takes <Setting value={commerce.domesticDeliveryEstimate} label="delivery estimate" /> after dispatch. Estimates aren&rsquo;t guaranteed delivery dates.
            </>
          ),
        },
        {
          q: "Where do you ship?",
          a: commerce.international.enabled ? (
            <>We ship within the United States and to the countries available at checkout. International orders may be subject to import duties and taxes.</>
          ) : (
            <>We currently ship to addresses within the United States only.</>
          ),
        },
        {
          q: "How much is shipping?",
          a: <>Shipping options and costs for your order are shown at checkout before you pay. See our <Link href="/shipping-policy">Shipping Policy</Link> for details.</>,
        },
        {
          q: "My package is late, lost or damaged. What should I do?",
          a: (
            <>
              <Link href="/contact">Contact us</Link> with your order number <Setting value={commerce.deliveryIssueReportWindow} label="reporting window" />. For damage, please include photos of the item and packaging.
            </>
          ),
        },
      ],
    },
    {
      title: "Returns & refunds",
      items: [
        {
          q: "What is your return policy?",
          a: (
            <>
              Eligible items can be returned within <Setting value={r.windowDays} label="return window" />{r.windowDays !== null && " days"} of delivery if they are unused and in their original packaging. Read the full <Link href="/return-policy">Return &amp; Refund Policy</Link>.
            </>
          ),
        },
        {
          q: "How do I start a return?",
          a: <>Contact customer support with your order number and the items you&rsquo;d like to return. We&rsquo;ll confirm eligibility and send return instructions. Please don&rsquo;t send items back without instructions.</>,
        },
        {
          q: "When will I get my refund?",
          a: (
            <>
              Approved refunds are issued to your original payment method within <Setting value={r.refundProcessingDays} label="refund processing time" /> of the return being received and inspected. Your bank or card issuer may take additional time to post it.
            </>
          ),
        },
      ],
    },
  ];

  return (
    <>
      <PageHeader title="Frequently asked questions" crumbs={[{ label: "FAQ", href: "/faq" }]} intro={<p>Can&rsquo;t find what you need? <Link href="/contact" className="link">Contact us</Link>.</p>} />
      <div className="page-x grid gap-12 py-12 sm:py-16 lg:grid-cols-12">
        <nav aria-label="FAQ sections" className="hidden lg:col-span-3 lg:block">
          <ul className="sticky top-28 space-y-2 text-sm">
            {groups.map((g) => (
              <li key={g.title}><a href={`#${g.title.toLowerCase().replace(/[^a-z]+/g, "-")}`} className="text-ink-2 hover:text-ink">{g.title}</a></li>
            ))}
          </ul>
        </nav>
        <div className="space-y-14 lg:col-span-8 lg:col-start-5">
          {groups.map((g) => (
            <section key={g.title} id={g.title.toLowerCase().replace(/[^a-z]+/g, "-")} className="scroll-mt-28">
              <h2 className="text-2xl sm:text-3xl">{g.title}</h2>
              <div className="mt-4 border-t border-line">
                {g.items.map((item) => (
                  <details key={item.q} className="group border-b border-line">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-4 font-medium [&::-webkit-details-marker]:hidden">
                      {item.q}
                      <span aria-hidden="true" className="text-lg leading-none text-muted transition-transform group-open:rotate-45">+</span>
                    </summary>
                    <div className="prose-store pb-5 text-sm">
                      <p className="!my-0">{item.a}</p>
                    </div>
                  </details>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </>
  );
}
