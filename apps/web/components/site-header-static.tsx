import { PaidAidLogo } from "./paidaid-logo";

export function SiteHeaderStatic() {
  return (
    <header className="border-b border-stone-200 dark:border-stone-800">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-6 py-4">
        <PaidAidLogo />
        <span className="text-sm text-stone-500">Loading wallet…</span>
      </div>
    </header>
  );
}
