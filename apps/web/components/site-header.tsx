"use client";

import { PaidAidLogo } from "./paidaid-logo";
import { SiteNavMain } from "./site-nav-main";
import { WalletControls } from "./wallet-controls";

export function SiteHeader() {
  return (
    <header className="border-b border-stone-200 dark:border-stone-800">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-6 sm:gap-8">
          <PaidAidLogo />
          <SiteNavMain />
        </div>
        <WalletControls />
      </div>
    </header>
  );
}
