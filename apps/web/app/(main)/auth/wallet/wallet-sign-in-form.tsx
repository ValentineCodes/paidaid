"use client";

import { useWalletSelector } from "@near-wallet-selector/react-hook";
import { useCallback, useState } from "react";
import { useSearchParams } from "next/navigation";

import {
  assertIntearWalletModule,
  signInWithIntearWallet,
} from "../../../../wallet/connect-intear";
import { readWalletContractId } from "../../../../wallet/config";
import { formatWalletConnectionError } from "../../../../wallet/errors";
import { useNearWalletAccountId } from "../../../../wallet/use-near-wallet-account";
import {
  completeWalletAuthentication,
  createWalletAuthChallenge,
} from "../../../auth/wallet-actions";
import { SignOutForm } from "../../../../components/sign-out-form";

function WalletSignInInner({ nextPath }: { nextPath: string }) {
  const { walletSelector, signOut, signMessage } = useWalletSelector();
  const { accountId, syncFromSelectorStore } = useNearWalletAccountId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const connectWallet = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const selector = await walletSelector;
      if (!selector) throw new Error("Wallet is still loading.");
      const contractId = readWalletContractId(process.env);
      await signInWithIntearWallet(selector, contractId);
      await syncFromSelectorStore();
    } catch (e) {
      setError(formatWalletConnectionError(e));
    } finally {
      setBusy(false);
    }
  }, [syncFromSelectorStore, walletSelector]);

  const signInWithWallet = useCallback(async () => {
    if (!accountId) {
      setError("Connect your NEAR wallet first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const challengeResult = await createWalletAuthChallenge(accountId);
      if (!challengeResult.ok) {
        setError(challengeResult.error);
        return;
      }
      const { challenge } = challengeResult;
      const signed = await signMessage({
        message: challenge.message,
        recipient: challenge.recipient,
        nonce: Buffer.from(challenge.nonceHex, "hex"),
      });
      if (!signed) {
        setError("Wallet did not return a signature.");
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
        signed,
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
  }, [accountId, nextPath, signMessage]);

  return (
    <div className="mx-auto mt-10 max-w-md space-y-4 rounded-xl border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-800 dark:bg-stone-950">
      <h1 className="text-xl font-semibold text-stone-900 dark:text-stone-100">
        Sign in with NEAR
      </h1>
      <p className="text-sm text-stone-600 dark:text-stone-400">
        Connect your wallet, then sign a one-time message. No password or email is
        required.
      </p>
      {accountId ? (
        <p className="font-mono text-xs text-stone-700 dark:text-stone-300">
          Connected: {accountId}
        </p>
      ) : null}
      <div className="flex flex-col gap-2 sm:flex-row">
        {!accountId ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void connectWallet()}
            className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-stone-100 dark:text-stone-900"
          >
            {busy ? "Connecting…" : "Connect wallet"}
          </button>
        ) : (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => void signInWithWallet()}
              className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-stone-100 dark:text-stone-900"
            >
              {busy ? "Signing in…" : "Sign in"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void signOut()}
              className="rounded-lg border border-stone-300 px-4 py-2 text-sm dark:border-stone-600"
            >
              Disconnect wallet
            </button>
          </>
        )}
      </div>
      {error ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function WalletSignInForm({
  alreadySignedIn,
}: {
  alreadySignedIn: boolean;
}) {
  const params = useSearchParams();
  const nextPath = params?.get("next")?.trim() || "/";

  return alreadySignedIn ? (
    <AlreadySignedIn nextPath={nextPath} />
  ) : (
    <WalletSignInInner nextPath={nextPath} />
  );
}

function AlreadySignedIn({ nextPath }: { nextPath: string }) {
  return (
    <div className="mx-auto mt-10 max-w-md space-y-4 rounded-xl border border-stone-200 p-6 dark:border-stone-800">
      <p className="text-sm text-stone-700 dark:text-stone-300">
        You are already signed in.
      </p>
      <a href={nextPath} className="text-sm font-semibold underline">
        Continue to {nextPath === "/" ? "home" : "your page"}
      </a>
      <SignOutForm />
    </div>
  );
}
