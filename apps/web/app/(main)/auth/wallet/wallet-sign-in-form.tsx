"use client";

import { useCallback, useMemo, useState } from "react";

import { formatWalletConnectionError } from "../../../../wallet/errors";
import { useNearWalletAccountId } from "../../../../wallet/use-near-wallet-account";
import { usePaidAidNearWallet } from "../../../../wallet/paidaid-near-wallet-context";
import { useOpenNearWalletConnect } from "../../../../wallet/use-open-near-wallet-connect";
import { networkBadgeLabel } from "../../../../wallet/near-wallet-connect-helpers";
import { executeNep413WalletSignIn } from "../../../../lib/wallet/execute-nep413-wallet-sign-in";
import { normalizeWalletProviderId } from "../../../../lib/wallet/near-wallet-authentication";
import {
  completeWalletAuthentication,
  createWalletAuthChallenge,
} from "../../../auth/wallet-actions";
import { Button } from "@/components/ui/button";

function WalletSignInInner({ nextPath }: { nextPath: string }) {
  const {
    disconnect,
    signMessage,
    capabilities,
    selectedWalletId,
    selectedWalletName,
    availableWallets,
    appNetworkId,
    getSessionAccountId,
  } = usePaidAidNearWallet();
  const openConnect = useOpenNearWalletConnect();
  const { accountId, syncFromSelectorStore } = useNearWalletAccountId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const networkBadge = networkBadgeLabel(appNetworkId);
  const walletIcon = useMemo(() => {
    if (!selectedWalletId) {
      return null;
    }
    return availableWallets.find((w) => w.id === selectedWalletId)?.icon ?? null;
  }, [availableWallets, selectedWalletId]);

  const connected = Boolean(accountId?.trim());

  const connectWallet = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      await openConnect();
      await syncFromSelectorStore();
    } catch (e) {
      setError(formatWalletConnectionError(e));
    } finally {
      setBusy(false);
    }
  }, [openConnect, syncFromSelectorStore]);

  const signInWithWallet = useCallback(async () => {
    const account =
      getSessionAccountId() ?? accountId?.trim().toLowerCase() ?? "";
    if (!account) {
      setError("Connect a wallet first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const challengeResult = await createWalletAuthChallenge(account);
      if (!challengeResult.ok) {
        setError(challengeResult.error);
        return;
      }
      const { challenge } = challengeResult;
      const signedResult = await executeNep413WalletSignIn({
        challenge,
        connectedAccountId: account,
        capabilities,
        signMessage,
      });
      if (!signedResult.ok) {
        setError(signedResult.error);
        return;
      }
      await completeWalletAuthentication({
        challengeId: challenge.challengeId,
        nearAccountId: challenge.nearAccountId,
        networkId: challenge.networkId,
        message: challenge.message,
        recipient: challenge.recipient,
        nonceHex: challenge.nonceHex,
        issuedAt: challenge.issuedAt,
        signed: signedResult.signed,
        walletProviderId: normalizeWalletProviderId(selectedWalletId),
        next: nextPath,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Sign-in failed.";
      if (!msg.includes("NEXT_REDIRECT")) {
        setError(msg);
      }
    } finally {
      setBusy(false);
    }
  }, [
    accountId,
    capabilities,
    getSessionAccountId,
    nextPath,
    selectedWalletId,
    signMessage,
  ]);

  return (
    <div className="mx-auto mt-8 w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-xl ring-1 ring-border/50 sm:mt-12">
      <div className="border-b border-border bg-muted/35 px-5 py-5 sm:px-6">
        <span className="inline-flex rounded-full border border-border bg-popover px-2.5 py-0.5 text-[10px] font-semibold tracking-wide text-muted-foreground">
          {networkBadge}
        </span>
        <h1 className="mt-3 font-heading text-xl font-semibold tracking-tight text-foreground">
          Sign in
        </h1>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          {connected
            ? "Approve the one-time message in your wallet to finish signing in. No funds are moved."
            : "You will be prompted to sign in after you connect."}
        </p>
      </div>

      <div className="space-y-4 px-5 py-5 sm:px-6">
        <ol className="flex gap-2 text-[11px] font-medium text-muted-foreground">
          <li
            className={`flex flex-1 items-center gap-2 rounded-full border px-3 py-1.5 ${
              connected
                ? "border-border bg-muted/40 text-foreground"
                : "border-primary/30 bg-primary/5 text-foreground"
            }`}
          >
            <span
              className={`flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                connected ? "bg-muted text-muted-foreground" : "bg-primary text-primary-foreground"
              }`}
            >
              1
            </span>
            Connect
          </li>
          <li
            className={`flex flex-1 items-center gap-2 rounded-full border px-3 py-1.5 ${
              connected
                ? "border-primary/30 bg-primary/5 text-foreground"
                : "border-border bg-transparent"
            }`}
          >
            <span
              className={`flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                connected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}
            >
              2
            </span>
            Sign in
          </li>
        </ol>

        {connected && accountId ? (
          <div className="rounded-2xl border border-border bg-muted/25 p-3">
            <div className="flex items-center gap-3">
              {walletIcon ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={walletIcon}
                  alt=""
                  className="size-10 shrink-0 rounded-xl object-cover ring-1 ring-border"
                  width={40}
                  height={40}
                />
              ) : null}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">
                  {selectedWalletName ?? "Wallet connected"}
                </p>
                <p className="mt-1 break-all font-mono text-[11px] leading-snug text-muted-foreground">
                  {accountId}
                </p>
              </div>
            </div>
          </div>
        ) : null}

        <div
          className={
            connected
              ? "flex flex-col gap-2 sm:flex-row sm:justify-center"
              : "flex justify-center"
          }
        >
          {!connected ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void connectWallet()}
              className="btn-ink h-11 min-w-[9.5rem] rounded-full px-8 text-sm font-semibold disabled:opacity-60"
            >
              {busy ? "Connecting…" : "Connect"}
            </button>
          ) : (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => void signInWithWallet()}
                className="btn-ink h-11 min-w-[9.5rem] rounded-full px-8 text-sm font-semibold disabled:opacity-60"
              >
                {busy ? "Signing in…" : "Sign in"}
              </button>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                className="h-11 min-w-[9.5rem] rounded-full px-8"
                onClick={() => void disconnect()}
              >
                Disconnect
              </Button>
            </>
          )}
        </div>

        {error ? (
          <p
            role="alert"
            className="rounded-xl border border-destructive/35 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function WalletSignInForm({ nextPath }: { nextPath: string }) {
  return <WalletSignInInner nextPath={nextPath} />;
}
