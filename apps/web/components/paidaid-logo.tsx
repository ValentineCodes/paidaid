import Link from "next/link";
import { PROTOCOL_NAME } from "@paidaid/shared";

export function PaidAidLogo() {
  return (
    <Link
      href="/"
      className="flex items-center gap-2.5 text-stone-900 dark:text-stone-100"
    >
      <span
        aria-hidden
        className="flex size-9 items-center justify-center rounded-lg bg-stone-900 text-sm font-semibold tracking-tight text-white dark:bg-stone-100 dark:text-stone-900"
      >
        PA
      </span>
      <span className="text-lg font-semibold tracking-tight">
        {PROTOCOL_NAME}
      </span>
    </Link>
  );
}
