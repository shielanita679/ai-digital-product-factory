import Link from "next/link";

import { CartButton } from "@/components/cart/cart-button";
import { SearchIcon, UserIcon } from "@/components/icons";
import { Logo } from "@/components/logo";
import { mainNav } from "@/config/navigation";

import { MobileMenu } from "./mobile-menu";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/95 backdrop-blur supports-[backdrop-filter]:bg-paper/85">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:bg-ink focus:px-3 focus:py-2 focus:text-paper">
        Skip to content
      </a>
      <div className="page-x flex h-16 items-center gap-2 lg:h-[4.5rem]">
        <div className="flex flex-1 items-center gap-1 lg:hidden">
          <MobileMenu />
        </div>

        <Logo />

        <nav aria-label="Main" className="ml-12 hidden flex-1 lg:block">
          <ul className="flex items-center gap-8">
            {mainNav.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="text-sm text-ink-2 transition-colors hover:text-ink">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex flex-1 items-center justify-end gap-0.5 lg:flex-none">
          <Link href="/search" className="grid size-10 place-items-center" aria-label="Search">
            <SearchIcon />
          </Link>
          <Link href="/account" className="hidden size-10 place-items-center lg:grid" aria-label="Account">
            <UserIcon />
          </Link>
          <CartButton />
        </div>
      </div>
    </header>
  );
}
