"use client";

import { PaidAidLogo } from "./paidaid-logo";
import { WalletControls } from "./wallet-controls";

const navItems = [{ href: "/", label: "Home" }] as const;

export function SiteHeader() {
  return (
    <header className="border-b border-stone-200 dark:border-stone-800">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-6 py-4">
        <div className="flex items-center gap-8">
          <PaidAidLogo />
          <nav aria-label="Main" className="hidden sm:block">
            <ul className="flex gap-6 text-sm font-medium text-stone-600 dark:text-stone-400">
              {navItems.map((item) => (
                <li key={item.href}>
                  <a
                    href={item.href}
                    className="transition hover:text-stone-900 dark:hover:text-stone-100"
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>
        <WalletControls />
      </div>
    </header>
  );
}
