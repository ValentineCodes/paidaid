"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import type { HeaderProfileLinkUser } from "./header-profile-link";

import { createClient } from "../lib/supabase/client";
import { clearWalletSession } from "../app/auth/wallet-actions";
import { fetchHeaderNativeNearBalance } from "../app/(main)/header-wallet-actions";
import {
  resolveHeaderWalletSyncState,
  truncateNearAccountId,
  type HeaderWalletSyncState,
} from "../lib/wallet/header-display";
import { AppToast } from "./app-toast";
import { useMarketplaceWalletAuth } from "../lib/wallet/use-marketplace-wallet-auth";
import { usePaidAidWallet } from "../wallet/use-paidaid-wallet";
import { formatWalletConnectionError } from "../wallet/errors";
import { useWalletShell } from "../wallet/wallet-shell-context";
import { useWalletConnectModal } from "../wallet/wallet-connect-modal-context";
import { usePaidAidNearWallet } from "../wallet/paidaid-near-wallet-context";
import { networkDisplayName } from "../wallet/near-wallet-connect-helpers";

type MarketplaceWalletControlProps = {
  hasSession: boolean;
  sessionNearAccountId: string | null;
  user?: HeaderProfileLinkUser | null;
};

const BALANCE_STALE_MS = 60_000;

export function MarketplaceWalletControl(props: MarketplaceWalletControlProps) {
  const walletShell = useWalletShell();
  const [shellToastOpen, setShellToastOpen] = useState(false);

  useEffect(() => {
    setShellToastOpen(Boolean(walletShell.error?.trim()));
  }, [walletShell.error]);

  if (!walletShell.ready) {
    return (
      <>
        <ConnectWalletOnly disabled label="Connecting…" />
        <AppToast
          variant="error"
          visible={shellToastOpen}
          message={walletShell.error ?? ""}
          onClose={() => setShellToastOpen(false)}
          durationMs={6000}
        />
      </>
    );
  }
  return <MarketplaceWalletControlInner {...props} />;
}

function useWalletErrorToast(message: string | null, onDismiss: () => void) {
  const [visible, setVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState("");

  useEffect(() => {
    if (!message?.trim()) {
      setVisible(false);
      return;
    }
    setToastMessage(message);
    setVisible(true);
  }, [message]);

  const closeToast = useCallback(() => {
    setVisible(false);
    onDismiss();
  }, [onDismiss]);

  return { visible, toastMessage, closeToast };
}

function MarketplaceWalletControlInner({
  hasSession,
  sessionNearAccountId,
  user,
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
  const balanceFetchedAtRef = useRef<number | null>(null);

  const {
    status: walletStatus,
    networkId,
    accountId: selectorAccountId,
    error: walletError,
    connect,
    disconnect,
    clearError,
  } = usePaidAidWallet();
  const { openConnectModal } = useWalletConnectModal();
  const { selectedWalletName, selectedWalletId, availableWallets } =
    usePaidAidNearWallet();
  const walletIcon =
    availableWallets.find((w) => w.id === selectedWalletId)?.icon ?? null;

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
        setBalanceLoading(false);
        return;
      }
      const fetchedAt = balanceFetchedAtRef.current;
      if (
        !force &&
        fetchedAt != null &&
        Date.now() - fetchedAt < BALANCE_STALE_MS
      ) {
        return;
      }
      setBalanceLoading(true);
      setBalanceError(null);
      try {
        const result = await fetchHeaderNativeNearBalance({
          forAccountId: selectorAccountId ?? undefined,
          refresh: force,
        });
        if (result.ok) {
          setBalanceDisplay(result.displayAmount);
          balanceFetchedAtRef.current = Date.now();
          setBalanceError(null);
        } else if (result.code === "mismatch") {
          setBalanceDisplay(null);
          setBalanceError(result.error);
        } else if (result.code === "signed_out") {
          setBalanceDisplay(null);
          setBalanceError(null);
        } else {
          setBalanceDisplay(null);
          setBalanceError(result.error);
        }
      } catch {
        setBalanceDisplay(null);
        setBalanceError("Could not load balance.");
      } finally {
        setBalanceLoading(false);
      }
    },
    [hasSession, selectorAccountId, sessionNearAccountId],
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
      balanceFetchedAtRef.current = null;
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
        balanceFetchedAtRef.current = null;
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
      openConnectModal({ preferPicker: true });
    } catch (e) {
      setMenuError(formatWalletConnectionError(e));
    }
  }, [disconnect, openConnectModal]);

  const handleCopyAccount = useCallback(async () => {
    const account = selectorAccountId ?? sessionNearAccountId;
    if (!account) {
      return;
    }
    try {
      await navigator.clipboard.writeText(account);
    } catch {
      setMenuError("Could not copy account ID.");
    }
  }, [selectorAccountId, sessionNearAccountId]);

  const handleDisconnect = useCallback(async () => {
    setMenuError(null);
    setOpen(false);
    setBalanceDisplay(null);
    balanceFetchedAtRef.current = null;
    try {
      await clearWalletSession();
      await disconnect();
      router.refresh();
    } catch (e) {
      setMenuError(e instanceof Error ? e.message : "Could not disconnect.");
    }
  }, [disconnect, router]);

  const combinedError = walletError ?? menuError ?? null;
  const dismissErrors = useCallback(() => {
    clearError();
    setMenuError(null);
  }, [clearError]);
  const errorToast = useWalletErrorToast(combinedError, dismissErrors);

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

  const openRefreshGuard = useRef(false);
  useEffect(() => {
    if (!open) {
      openRefreshGuard.current = false;
      return;
    }
    if (syncState !== "aligned" || openRefreshGuard.current) {
      return;
    }
    openRefreshGuard.current = true;
    void refreshBalance(true);
  }, [open, refreshBalance, syncState]);

  if (showConnectButton) {
    return (
      <>
        <button
          type="button"
          disabled={connectBusy}
          onClick={() => void handleConnect()}
          className="btn-ink h-[34px] rounded-full px-4 text-xs font-semibold sm:text-sm"
        >
          {connectBusy ? "Connecting…" : "Connect"}
        </button>
        <AppToast
          variant="error"
          visible={errorToast.visible}
          message={errorToast.toastMessage}
          onClose={errorToast.closeToast}
          durationMs={6000}
        />
      </>
    );
  }

  const headerAccount =
    displayAccountId ?? sessionNearAccountId ?? selectorAccountId ?? "";

  const showBalanceSkeleton =
    syncState === "aligned" && balanceLoading && !balanceDisplay;

  const showSignInRequiredPill =
    (syncState === "wallet_only" || syncState === "mismatch") &&
    Boolean(selectorAccountId) &&
    !authBusy;

  return (
    <>
    <div className="relative overflow-visible" ref={menuRef}>
        {showSignInRequiredPill ? (
          <SignInRequiredPill
            disabled={menuInteractionBusy}
            onSignIn={() => void runAuthenticate()}
          />
        ) : null}
        <button
          type="button"
          disabled={menuInteractionBusy}
          aria-expanded={open}
          aria-haspopup="menu"
          aria-controls={menuId}
          aria-label={
            showSignInRequiredPill
              ? "Wallet connected — sign in required"
              : undefined
          }
          onClick={() => setOpen((v) => !v)}
          className="flex h-[34px] max-w-[min(100%,14rem)] items-center gap-2 rounded-full border border-border bg-card py-0 pl-1.5 pr-2.5 text-left text-xs text-foreground shadow-sm backdrop-blur-sm transition hover:border-stone-300 hover:bg-muted"
        >
          {walletIcon ? (
            // eslint-disable-next-line @next/next/no-img-element -- dynamic wallet icon
            <img
              src={walletIcon}
              alt=""
              className="size-[26px] shrink-0 rounded-full ring-1 ring-border"
              width={26}
              height={26}
            />
          ) : (
            <span className="flex size-[26px] shrink-0 items-center justify-center rounded-full bg-muted text-[9px] font-bold text-muted-foreground">
              NEAR
            </span>
          )}
          <span className="min-w-0 truncate font-mono text-[11px] font-semibold sm:text-xs">
            {truncateNearAccountId(headerAccount)}
          </span>
          <ChevronIcon open={open} />
        </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 top-[calc(100%+8px)] z-50 w-[min(100vw-2rem,19rem)] overflow-hidden rounded-2xl border border-border bg-popover text-popover-foreground text-sm shadow-xl ring-1 ring-border/50"
        >
          <div className="border-b border-border bg-muted/35 px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Balance
                </p>
                {showBalanceSkeleton ? (
                  <div
                    className="mt-1.5 h-7 w-32 animate-pulse rounded-lg bg-stone-300/60"
                    aria-hidden
                  />
                ) : (
                  <p className="mt-0.5 font-mono text-lg font-semibold tracking-tight text-popover-foreground">
                    {syncState === "aligned" && balanceDisplay
                      ? balanceDisplay
                      : "—"}
                  </p>
                )}
                {balanceError && syncState === "aligned" ? (
                  <p className="mt-1 text-[11px] text-amber-600">
                    {balanceError}
                  </p>
                ) : null}
              </div>
              {walletIcon ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={walletIcon}
                  alt=""
                  className="size-10 rounded-xl ring-1 ring-border"
                  width={40}
                  height={40}
                />
              ) : null}
            </div>
            <p className="mt-3 break-all font-mono text-[11px] leading-snug text-muted-foreground">
              {headerAccount}
            </p>
            <p className="mt-1 text-[10px] text-muted-foreground">
              {selectedWalletName ?? "NEAR wallet"} · {networkDisplayName(networkId)}
            </p>
          </div>

          {syncState === "mismatch" ? (
            <div
              className="border-b border-amber-500/25 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-700"
              role="status"
            >
              Connected wallet does not match your signed-in account.
            </div>
          ) : null}

          {user ? (
            <Link
              href="/account"
              className="flex items-center gap-3 border-b border-border px-4 py-3 transition hover:bg-muted sm:hidden"
              onClick={() => setOpen(false)}
            >
              <span className="avatar small shrink-0">
                {user.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={user.avatarKey}
                    src={user.avatarUrl}
                    alt=""
                    width={34}
                    height={34}
                  />
                ) : (
                  profileInitials(user.displayName)
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-popover-foreground">
                  {user.displayName || "Your profile"}
                </span>
                <span className="text-[11px] text-muted-foreground">Account & settings</span>
              </span>
            </Link>
          ) : null}

          <ul className="flex flex-col p-1.5">
            <WalletMenuItem
              label="Copy account ID"
              disabled={walletActionBusy}
              onClick={() => void handleCopyAccount()}
            />
            <WalletMenuItem
              label="Switch wallet"
              disabled={walletActionBusy}
              onClick={() => void handleSwitchWallet()}
            />
            {(syncState === "mismatch" || syncState === "wallet_only") &&
            selectorAccountId ? (
              <WalletMenuItem
                label={authBusy ? "Signing in…" : "Sign in with this wallet"}
                disabled={authBusy}
                emphasized
                onClick={() => void runAuthenticate()}
              />
            ) : null}
            <WalletMenuItem
              label="Disconnect"
              disabled={menuInteractionBusy}
              destructive
              onClick={() => void handleDisconnect()}
            />
          </ul>
        </div>
      ) : null}

    </div>
    <AppToast
      variant="error"
      visible={errorToast.visible}
      message={errorToast.toastMessage}
      onClose={errorToast.closeToast}
      durationMs={6000}
    />
    </>
  );
}

function SignInRequiredPill({
  disabled,
  onSignIn,
}: {
  disabled?: boolean;
  onSignIn: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onSignIn();
      }}
      className="absolute -right-1 -top-2.5 z-20 max-w-[calc(100%+0.5rem)] truncate rounded-full border border-amber-400/80 bg-amber-400 px-2 py-px text-[9px] font-bold uppercase leading-tight tracking-wide text-amber-950 shadow-sm ring-2 ring-card transition hover:border-amber-500 hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
      aria-label="Sign in with connected wallet"
    >
      Sign in required
    </button>
  );
}

function ConnectWalletOnly({
  disabled,
  label,
}: {
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      className="btn-ink h-[34px] rounded-full px-4 text-xs font-semibold sm:text-sm"
    >
      {label}
    </button>
  );
}

function WalletMenuItem({
  label,
  onClick,
  disabled,
  destructive,
  emphasized,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
  emphasized?: boolean;
}) {
  return (
    <li>
      <button
        type="button"
        role="menuitem"
        disabled={disabled}
        onClick={onClick}
        className={`w-full rounded-xl px-3 py-2.5 text-left text-[13px] transition disabled:opacity-50 ${
          destructive
            ? "text-destructive hover:bg-destructive/10"
            : emphasized
              ? "font-semibold text-popover-foreground hover:bg-muted"
              : "text-stone-600 hover:bg-muted"
        }`}
      >
        {label}
      </button>
    </li>
  );
}

function profileInitials(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  }
  if (parts[0]) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return "PA";
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

