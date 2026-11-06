import Link from "next/link";

import { PaidAidLogo } from "./paidaid-logo";
import { SiteNavMain } from "./site-nav-main";
import { SignOutForm } from "./sign-out-form";

type SiteHeaderMarketplaceProps = {
  user: { email: string; id: string } | null;
};

export function SiteHeaderMarketplace({ user }: SiteHeaderMarketplaceProps) {
  return (
    <header className="border-b border-stone-200 dark:border-stone-800">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-6 sm:gap-8">
          <PaidAidLogo />
          <SiteNavMain />
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          {user ? (
            <>
              <span className="truncate text-stone-500 dark:text-stone-400">
                {user.email}
              </span>
              <Link
                href="/account"
                className="rounded-lg border border-stone-300 px-3 py-1.5 font-medium text-stone-800 transition hover:bg-stone-100 dark:border-stone-600 dark:text-stone-100 dark:hover:bg-stone-800"
              >
                Account
              </Link>
              <SignOutForm />
            </>
          ) : (
            <>
              <Link
                href="/auth/login"
                className="rounded-lg px-3 py-1.5 font-medium text-stone-700 transition hover:text-stone-900 dark:text-stone-300 dark:hover:text-stone-100"
              >
                Sign in
              </Link>
              <Link
                href="/auth/sign-up"
                className="rounded-lg bg-stone-900 px-3 py-1.5 font-medium text-white transition hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-200"
              >
                Sign up
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
