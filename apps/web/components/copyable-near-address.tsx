"use client";

import { useCallback, useState } from "react";

/** Middle ellipsis for long ids (ETH-style address chips). */
export function truncateAddressMiddle(
  value: string,
  headChars = 10,
  tailChars = 8,
): string {
  const id = value.trim();
  if (id.length <= headChars + tailChars + 1) {
    return id;
  }
  return `${id.slice(0, headChars)}…${id.slice(-tailChars)}`;
}

type CopyableNearAddressProps = {
  accountId: string;
  className?: string;
};

export function CopyableNearAddress({
  accountId,
  className,
}: CopyableNearAddressProps) {
  const [copied, setCopied] = useState(false);
  const display = truncateAddressMiddle(accountId);

  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(accountId.trim());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore — clipboard blocked */
    }
  }, [accountId]);

  const rootClass = ["inline-flex max-w-full items-center gap-0.5", className]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={rootClass}>
      <span
        className="min-w-0 truncate font-mono text-[11px] text-[var(--muted)]"
        title={accountId}
      >
        {display}
      </span>
      <button
        type="button"
        onClick={() => void onCopy()}
        className="inline-flex shrink-0 items-center justify-center rounded-md border border-[var(--line)] p-1 text-[var(--muted)] transition hover:bg-[var(--line)]/40 hover:text-[var(--ink)]"
        aria-label={copied ? "Copied" : "Copy NEAR address"}
      >
        {copied ? (
          <svg
            width={14}
            height={14}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        ) : (
          <svg
            width={14}
            height={14}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden
          >
            <rect x="9" y="9" width="13" height="13" rx="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        )}
      </button>
      <span className="sr-only" aria-live="polite">
        {copied ? "Address copied" : ""}
      </span>
    </div>
  );
}
