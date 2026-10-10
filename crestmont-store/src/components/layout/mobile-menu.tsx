"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import { CloseIcon, MenuIcon } from "@/components/icons";
import { Logo } from "@/components/logo";
import { mainNav } from "@/config/navigation";

export function MobileMenu() {
  const dialog = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();

  // Close after navigation.
  useEffect(() => {
    dialog.current?.close();
  }, [pathname]);

  const close = () => dialog.current?.close();

  return (
    <>
      <button type="button" className="-ml-2 grid size-10 place-items-center" aria-label="Open menu" onClick={() => dialog.current?.showModal()}>
        <MenuIcon />
      </button>
      <dialog
        ref={dialog}
        aria-label="Menu"
        onClick={(e) => e.target === e.currentTarget && close()}
        className="fixed inset-y-0 right-auto left-0 m-0 h-dvh max-h-dvh w-[min(22rem,88vw)] bg-paper p-0 text-ink backdrop:bg-ink/30 open:flex open:flex-col"
      >
        <div className="flex h-16 items-center justify-between border-b border-line px-4">
          <Logo />
          <button type="button" onClick={close} className="-mr-2 grid size-10 place-items-center" aria-label="Close menu">
            <CloseIcon />
          </button>
        </div>
        <nav aria-label="Mobile" className="flex-1 overflow-y-auto px-4 py-4">
          <ul>
            {mainNav.map((item) => (
              <li key={item.href} className="border-b border-line">
                <Link href={item.href} onClick={close} className="block py-4 font-serif text-xl">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
          <ul className="mt-6 space-y-3 text-sm text-ink-2">
            <li><Link href="/account" onClick={close}>Account</Link></li>
            <li><Link href="/order-tracking" onClick={close}>Order tracking</Link></li>
            <li><Link href="/shipping-policy" onClick={close}>Shipping</Link></li>
            <li><Link href="/return-policy" onClick={close}>Returns</Link></li>
          </ul>
        </nav>
      </dialog>
    </>
  );
}
