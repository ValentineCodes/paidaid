"use client";

import { useWalletSelector } from "@near-wallet-selector/react-hook";
import { useCallback, useEffect, useState } from "react";

import { NearSessionProvider } from "../../../wallet/near-session-provider";
import {
  assertIntearWalletModule,
  signInWithIntearWallet,
} from "../../../wallet/connect-intear";
import { readWalletContractId } from "../../../wallet/config";
import { formatWalletConnectionError } from "../../../wallet/errors";
import {
  completeWalletLink,
  createWalletLinkChallenge,
  unlinkNearWallet,
} from "./wallet-link-actions";
import { LinkedWalletBalances } from "./linked-wallet-balances";

export type LinkedNearWallet = {
  nearAccountId: string;
  publicKey: string;
  linkedAt: string;
};

type Props = {
  linked: LinkedNearWallet | null;
};

function NearWalletSectionInner({ linked: initialLinked }: Props) {
  const {
    walletSelector,
    signedAccountId,
    signIn,
    signOut,
    signMessage,
  } = useWalletSelector();

  const [linked, setLinked] = useState(initialLinked);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const connectWallet = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const selector = await walletSelector;
      if (!selector) {
        throw new Error("Wallet is still loading.");
      }
      const contractId = readWalletContractId({
        NEXT_PUBLIC_NEAR_CONTRACT_ID: process.env.NEXT_PUBLIC_NEAR_CONTRACT_ID,
      });
      await signInWithIntearWallet(selector, contractId);
    } catch (e) {
      setError(formatWalletConnectionError(e));
    } finally {
      setBusy(false);
    }
  }, [walletSelector]);

  const switchAccount = useCallback(() => {
    signIn();
  }, [signIn]);

  const disconnectWallet = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      await signOut();
    } catch (e) {
      setError(formatWalletConnectionError(e));
    } finally {
      setBusy(false);
    }
  }, [signOut]);

  const linkWallet = useCallback(async () => {
    if (!signedAccountId) {
      setError("Connect a wallet before linking.");
      return;
    }
    setError(null);
    setStatus(null);
    setBusy(true);
    try {
      const created = await createWalletLinkChallenge(signedAccountId);
      if (!created.ok) {
        setError(created.error);
        return;
      }
      const { challenge } = created;
      const nonce = Buffer.from(challenge.nonceHex, "hex");
      const signed = await signMessage({
        message: challenge.message,
        recipient: challenge.recipient,
        nonce,
      });
      if (!signed) {
        setError("Wallet did not return a signature.");
        return;
      }
      const result = await completeWalletLink({
        challengeId: challenge.challengeId,
        nearAccountId: challenge.nearAccountId,
        recipient: challenge.recipient,
        nonceHex: challenge.nonceHex,
        signed: {
          accountId: signed.accountId,
          publicKey: signed.publicKey,
          signature: signed.signature,
        },
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setLinked({
        nearAccountId: signed.accountId,
        publicKey: signed.publicKey,
        linkedAt: new Date().toISOString(),
      });
      setStatus("NEAR wallet linked to your PaidAid account.");
    } catch (e) {
      setError(formatWalletConnectionError(e));
    } finally {
      setBusy(false);
    }
  }, [signedAccountId, signMessage]);

  const handleUnlink = useCallback(async () => {
    setError(null);
    setStatus(null);
    setBusy(true);
    try {
      const result = await unlinkNearWallet();
      if (result.error) {
        setError(result.error);
        return;
      }
      setLinked(null);
      setStatus("Wallet unlinked. Marketplace access is unchanged.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unlink failed.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void walletSelector?.then((selector) => {
      if (selector) {
        try {
          assertIntearWalletModule(selector);
        } catch (e) {
          setError(formatWalletConnectionError(e));
        }
      }
    });
  }, [walletSelector]);

  return (
    <section className="profile-card mt-8 text-left" aria-labelledby="near-wallet-heading">
      <div className="page-heading !mb-4 !text-left">
        <span>PAYMENTS (V2)</span>
        <h2 id="near-wallet-heading" className="!text-lg">
          NEAR wallet
        </h2>
        <p className="!text-sm">
          Optional. Link a wallet for future on-chain payments. Browsing and V1
          marketplace features do not require a wallet.
        </p>
      </div>

      {linked ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm">
            Linked account:{" "}
            <code className="font-mono text-[var(--ink)]">{linked.nearAccountId}</code>
          </p>
          <p className="text-[11px] text-[var(--muted)]">
            Public key: <span className="font-mono">{linked.publicKey}</span>
          </p>
          <button
            type="button"
            className="profile-edit-link w-fit"
            disabled={busy}
            onClick={() => void handleUnlink()}
          >
            {busy ? "Unlinking…" : "Unlink wallet"}
          </button>
          <LinkedWalletBalances hasLinkedWallet />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            {signedAccountId ? (
              <>
                <span className="font-mono text-sm">{signedAccountId}</span>
                <button
                  type="button"
                  className="text-sm font-semibold underline"
                  disabled={busy}
                  onClick={switchAccount}
                >
                  Switch account
                </button>
                <button
                  type="button"
                  className="text-sm font-semibold underline"
                  disabled={busy}
                  onClick={() => void disconnectWallet()}
                >
                  Disconnect
                </button>
              </>
            ) : (
              <button
                type="button"
                className="create-button"
                disabled={busy}
                onClick={() => void connectWallet()}
              >
                {busy ? "Connecting…" : "Connect wallet"}
              </button>
            )}
          </div>
          {signedAccountId ? (
            <button
              type="button"
              className="profile-edit-link w-fit"
              disabled={busy}
              onClick={() => void linkWallet()}
            >
              {busy ? "Linking…" : "Sign & link to PaidAid"}
            </button>
          ) : null}
        </div>
      )}

      {status ? (
        <p className="mt-3 text-sm text-emerald-800" role="status">
          {status}
        </p>
      ) : null}
      {error ? (
        <p className="mt-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}

export function NearWalletSection(props: Props) {
  return (
    <NearSessionProvider>
      <NearWalletSectionInner {...props} />
    </NearSessionProvider>
  );
}
