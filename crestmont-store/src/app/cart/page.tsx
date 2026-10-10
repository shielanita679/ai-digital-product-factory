import type { Metadata } from "next";

import { CartPageView } from "@/components/cart/cart-page-view";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = {
  ...pageMetadata({ title: "Cart", description: "Review the items in your cart.", path: "/cart" }),
  robots: { index: false, follow: true },
};

export default function CartPage() {
  return (
    <div className="page-x py-10 sm:py-14">
      <h1 className="mb-8 text-4xl sm:text-5xl">Cart</h1>
      <CartPageView />
    </div>
  );
}
