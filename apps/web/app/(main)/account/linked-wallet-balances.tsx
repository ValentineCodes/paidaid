"use client";

import { useCallback, useEffect, useState } from "react";

import {
  fetchLinkedWalletBalances,
  type WalletBalancesActionResult,
} from "./wallet-balances-action";

type Props = {
  /** From DB — balances are not loaded from an ephemeral wallet connection. */
  hasLinkedWallet: boolean;
};

export function LinkedWalletBalances({ hasLinkedWallet }: Props) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<WalletBalancesActionResult | null>(null);

  const load = useCallback(async (refresh = false) => {
    setLoading(true);
    try {
      const res = await fetchLinkedWalletBalances({ refresh });
      setResult(res);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!hasLinkedWallet) {
      return;
    }
    void load(false);
  }, [hasLinkedWallet, load]);

  if (!hasLinkedWallet) {
    return null;
  }

  return (
    <div className="mt-6 border-t border-[var(--line)] pt-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
            Balances
          </span>
          <p className="text-[11px] text-[var(--muted)]">
            Read-only · linked account only
          </p>
        </div>
        <button
          type="button"
          className="text-sm font-semibold underline disabled:opacity-50"
          disabled={loading}
          onClick={() => void load(true)}
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {loading && !result ? (
        <p className="text-sm text-[var(--muted)]">Loading balances…</p>
      ) : null}

      {result && !result.ok ? (
        <p className="text-sm text-red-700" role="alert">
          {result.error}
        </p>
      ) : null}

      {result?.ok ? (
        <>
          <p className="mb-2 text-[11px] text-[var(--muted)]">
            Network:{" "}
            <code className="font-mono text-[var(--ink)]">
              {result.snapshot.networkId}
            </code>
            {result.snapshot.fromCache ? " · cached" : null} ·{" "}
            {new Date(result.snapshot.fetchedAt).toLocaleTimeString()}
          </p>
          <ul className="flex flex-col gap-2">
            {result.snapshot.lines.map((line) => (
              <li
                key={line.canonicalAssetKey}
                className="flex items-center justify-between rounded-lg border border-[var(--line)] px-3 py-2 text-sm"
              >
                <span className="font-semibold">{line.symbol}</span>
                {line.status === "ok" ? (
                  <span className="font-mono text-[var(--ink)]">
                    {line.displayAmount ?? line.smallestUnits}
                  </span>
                ) : (
                  <span className="text-[var(--muted)]" title={line.message}>
                    {line.status === "rpc_error"
                      ? "RPC unavailable"
                      : "Unavailable"}
                  </span>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] text-[var(--muted)]">
            {result.snapshot.disclaimer}
          </p>
        </>
      ) : null}
    </div>
  );
}
