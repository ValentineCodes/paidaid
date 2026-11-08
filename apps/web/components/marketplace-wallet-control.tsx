"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { createClient } from "../lib/supabase/client";
import { clearWalletSession } from "../app/auth/wallet-actions";
import { fetchHeaderNativeNearBalance } from "../app/(main)/header-wallet-actions";
import {
  resolveHeaderWalletSyncState,
  truncateNearAccountId,
  type HeaderWalletSyncState,
} from "../lib/wallet/header-display";
import { useMarketplaceWalletAuth } from "../lib/wallet/use-marketplace-wallet-auth";
import { usePaidAidWallet } from "../wallet/use-paidaid-wallet";
import { formatWalletConnectionError } from "../wallet/errors";
import { useWalletShell } from "../wallet/wallet-shell-context";

type MarketplaceWalletControlProps = {
  hasSession: boolean;
  sessionNearAccountId: string | null;
};

const BALANCE_STALE_MS = 60_000;

export function MarketplaceWalletControl(props: MarketplaceWalletControlProps) {
  const walletShell = useWalletShell();
  if (!walletShell.ready) {
    return (
      <ConnectWalletOnly
        disabled
        label="Connecting…"
        error={walletShell.error}
      />
    );
  }
  return <MarketplaceWalletControlInner {...props} />;
}

function MarketplaceWalletControlInner({
  hasSession,
  sessionNearAccountId,
}: MarketplaceWalletControlProps) {
  const router = useRouter();
  const menuId = useId();
  const menuRef = useRef<HTMLDivElement>(null);
  const lastAutoAuthRef = useRef<string | null>(null);
  const [open, setOpen] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [menuError, setMenuError] = useState<string | null>(null);
  const [balanceDisplay, setBalanceDisplay] = useState<string | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [balanceFetchedAt, setBalanceFetchedAt] = useState<number | null>(null);

  const {
    status: walletStatus,
    accountId: selectorAccountId,
    error: walletError,
    connect,
    disconnect,
    clearError,
  } = usePaidAidWallet();

  const { authenticateConnectedAccount } = useMarketplaceWalletAuth();

  const syncState: HeaderWalletSyncState = resolveHeaderWalletSyncState({
    hasSession,
    sessionNearAccountId,
    selectorAccountId,
  });

  const displayAccountId =
    syncState === "aligned" || syncState === "session_only"
      ? sessionNearAccountId
      : selectorAccountId;

  const refreshBalance = useCallback(
    async (force = false) => {
      if (!hasSession || !sessionNearAccountId) {
        setBalanceDisplay(null);
        setBalanceError(null);
        return;
      }
      if (
        !force &&
        balanceFetchedAt != null &&
        Date.now() - balanceFetchedAt < BALANCE_STALE_MS
      ) {
        return;
      }
      setBalanceLoading(true);
      setBalanceError(null);
      const result = await fetchHeaderNativeNearBalance({
        forAccountId: selectorAccountId ?? undefined,
        refresh: force,
      });
      setBalanceLoading(false);
      if (result.ok) {
        setBalanceDisplay(result.displayAmount);
        setBalanceFetchedAt(Date.now());
        setBalanceError(null);
      } else if (result.code === "mismatch") {
        setBalanceDisplay(null);
        setBalanceError(result.error);
      } else if (result.code === "signed_out") {
        setBalanceDisplay(null);
      } else {
        setBalanceError(result.error);
      }
    },
    [balanceFetchedAt, hasSession, selectorAccountId, sessionNearAccountId],
  );

  useEffect(() => {
    if (syncState === "aligned") {
      void refreshBalance(false);
    }
  }, [refreshBalance, syncState]);

  useEffect(() => {
    const onFocus = () => {
      if (syncState === "aligned") {
        void refreshBalance(false);
      }
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refreshBalance, syncState]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const runAuthenticate = useCallback(async () => {
    const account = selectorAccountId?.trim();
    if (!account) {
      setMenuError("Connect a NEAR wallet first.");
      return;
    }
    setAuthBusy(true);
    setMenuError(null);
    try {
      const result = await authenticateConnectedAccount(account);
      if (result.error) {
        setMenuError(result.error);
        return;
      }
      setBalanceFetchedAt(null);
      router.refresh();
    } catch (e) {
      setMenuError(e instanceof Error ? e.message : "Sign-in failed.");
    } finally {
      setAuthBusy(false);
    }
  }, [authenticateConnectedAccount, router, selectorAccountId]);

  const handleConnect = useCallback(async () => {
    setMenuError(null);
    clearError();
    await connect();
  }, [clearError, connect]);

  useEffect(() => {
    if (syncState !== "wallet_only" || authBusy || !selectorAccountId) return;
    if (lastAutoAuthRef.current === selectorAccountId.toLowerCase()) return;
    lastAutoAuthRef.current = selectorAccountId.toLowerCase();
    void runAuthenticate();
  }, [authBusy, runAuthenticate, selectorAccountId, syncState]);

  useEffect(() => {
    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setBalanceDisplay(null);
        setBalanceFetchedAt(null);
        router.refresh();
      }
      if (event === "SIGNED_IN") {
        router.refresh();
      }
    });
    return () => subscription.unsubscribe();
  }, [router]);

  const handleSwitchWallet = useCallback(async () => {
    setMenuError(null);
    setOpen(false);
    lastAutoAuthRef.current = null;
    try {
      await disconnect();
      await connect();
    } catch (e) {
      setMenuError(formatWalletConnectionError(e));
    }
  }, [connect, disconnect]);

  const handleDisconnect = useCallback(async () => {
    setMenuError(null);
    setOpen(false);
    setBalanceDisplay(null);
    setBalanceFetchedAt(null);
    try {
      await clearWalletSession();
      await disconnect();
      router.refresh();
    } catch (e) {
      setMenuError(e instanceof Error ? e.message : "Could not disconnect.");
    }
  }, [disconnect, router]);

  const connectBusy =
    authBusy ||
    walletStatus === "connecting" ||
    walletStatus === "initializing";

  const menuInteractionBusy =
    authBusy || walletStatus === "disconnecting";

  const walletActionBusy =
    authBusy ||
    walletStatus === "connecting" ||
    walletStatus === "disconnecting";

  const showConnectButton =
    syncState === "signed_out" || syncState === "session_only";

  if (showConnectButton) {
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            disabled={connectBusy}
            onClick={() => void handleConnect()}
            className="btn-ink rounded-lg px-3 py-2 text-xs font-semibold sm:text-sm"
          >
            {connectBusy ? "Connecting…" : "Connect"}
          </button>
        </div>
        {(walletError || menuError) && (
          <HeaderAlert
            message={walletError ?? menuError ?? ""}
            onDismiss={() => {
              clearError();
              setMenuError(null);
            }}
          />
        )}
        {syncState === "session_only" && sessionNearAccountId ? (
          <p className="max-w-xs text-right text-[10px] text-[var(--muted)]">
            Signed in as {truncateNearAccountId(sessionNearAccountId)} — connect
            wallet to transact.
          </p>
        ) : null}
      </div>
    );
  }

  const headerAccount =
    displayAccountId ?? sessionNearAccountId ?? selectorAccountId ?? "";

  return (
    <div className="relative flex flex-col items-end gap-1" ref={menuRef}>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          disabled={menuInteractionBusy}
          aria-expanded={open}
          aria-haspopup="menu"
          aria-controls={menuId}
          onClick={() => setOpen((v) => !v)}
          className="text-on-light-surface flex max-w-[min(100%,18rem)] flex-nowrap items-center gap-2 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-left text-xs shadow-sm transition hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-900 dark:hover:bg-stone-800"
        >
          <span className="min-w-0 truncate font-mono font-medium">
            {truncateNearAccountId(headerAccount)}
          </span>
          {syncState === "aligned" && balanceDisplay ? (
            <span className="text-on-light-surface-muted hidden shrink-0 whitespace-nowrap sm:inline">
              {balanceLoading ? "…" : balanceDisplay}
            </span>
          ) : null}
          <ChevronIcon open={open} />
        </button>
      </div>

      {open ? (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 top-[calc(100%+6px)] z-50 w-[min(100vw-2rem,20rem)] rounded-xl border border-stone-200 bg-white p-3 text-sm shadow-lg dark:border-stone-700 dark:bg-stone-950"
        >
          {syncState === "mismatch" ? (
            <div
              className="mb-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
              role="status"
            >
              Wallet ({truncateNearAccountId(selectorAccountId ?? "")}) does not
              match your signed-in account. Re-authenticate or switch back.
            </div>
          ) : null}

          <ul className="flex flex-col gap-1">
            <li>
              <button
                type="button"
                role="menuitem"
                className="w-full rounded-lg px-2 py-2 text-left hover:bg-stone-100 dark:hover:bg-stone-900"
                disabled={walletActionBusy}
                onClick={() => void handleSwitchWallet()}
              >
                Switch wallet (Intear)
              </button>
            </li>
            {(syncState === "mismatch" || syncState === "wallet_only") &&
            selectorAccountId ? (
              <li>
                <button
                  type="button"
                  role="menuitem"
                  className="w-full rounded-lg px-2 py-2 text-left font-semibold hover:bg-stone-100 dark:hover:bg-stone-900"
                  disabled={authBusy}
                  onClick={() => void runAuthenticate()}
                >
                  {authBusy ? "Signing in…" : "Sign in with this wallet"}
                </button>
              </li>
            ) : null}
            {hasSession ? (
              <li>
                <Link
                  href="/account"
                  role="menuitem"
                  className="block rounded-lg px-2 py-2 hover:bg-stone-100 dark:hover:bg-stone-900"
                  onClick={() => setOpen(false)}
                >
                  Profile & settings
                </Link>
              </li>
            ) : null}
            <li>
              <button
                type="button"
                role="menuitem"
                className="w-full rounded-lg px-2 py-2 text-left text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/40"
                disabled={menuInteractionBusy}
                onClick={() => void handleDisconnect()}
              >
                Disconnect
              </button>
            </li>
          </ul>
        </div>
      ) : null}

      {(walletError || menuError) && (
        <HeaderAlert
          message={walletError ?? menuError ?? ""}
          onDismiss={() => {
            clearError();
            setMenuError(null);
          }}
        />
      )}
    </div>
  );
}

function ConnectWalletOnly({
  disabled,
  label,
  error,
}: {
  disabled?: boolean;
  label: string;
  error?: string | null;
}) {
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          disabled={disabled}
          className="btn-ink rounded-lg px-3 py-2 text-xs font-semibold sm:text-sm"
        >
          {label}
        </button>
      </div>
      {error ? (
        <p className="max-w-xs text-right text-[10px] text-red-700 dark:text-red-300">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={open ? "rotate-180 transition" : "transition"}
      aria-hidden
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function HeaderAlert({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex max-w-xs items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-2 py-1.5 text-right text-[10px] text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
    >
      <span className="flex-1">{message}</span>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 font-semibold underline-offset-2 hover:underline"
      >
        Dismiss
      </button>
    </div>
  );
}
