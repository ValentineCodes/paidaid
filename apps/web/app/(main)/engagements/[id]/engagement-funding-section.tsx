"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useWalletSelector } from "@near-wallet-selector/react-hook";
import { useNearWalletAccountId } from "../../../../wallet/use-near-wallet-account";
import { formatSmallestUnits, parseNearNetworkId } from "@paidaid/shared";
import {
  explorerTransactionUrl,
  normalizeTransactionOutcome,
  parseEscrowIdFromCreateOutcome,
} from "@paidaid/near";
import { NearSessionProvider } from "../../../../wallet/near-session-provider";
import { formatWalletConnectionError } from "../../../../wallet/errors";
import {
  signInWithIntearWallet,
  assertIntearWalletModule,
} from "../../../../wallet/connect-intear";
import { readWalletContractId } from "../../../../wallet/config";
import {
  sendCreateEscrowTransaction,
  sendFundEscrowTransaction,
} from "../../../../wallet/send-escrow-funding";
import {
  checkRequesterFundingBalance,
  loadEngagementFundingPrerequisites,
  prepareEngagementFunding,
  reportEngagementCreateTx,
  reportEngagementFundTx,
  syncEngagementEscrowFromChain,
  type EngagementFundingPrerequisites,
} from "../engagement-funding-actions";
import type { EngagementFundingPrepareResult } from "../../../../lib/engagement/funding-types";
import { formatEngagementFundingError } from "../../../../lib/engagement/funding-errors";

type Props = {
  engagementId: string;
  initialTerms: EngagementFundingPrepareResult | null;
  linkedRequesterNearAccountId: string | null;
  initialPrerequisites: EngagementFundingPrerequisites | null;
};

function FundingSectionInner({
  engagementId,
  initialTerms,
  linkedRequesterNearAccountId,
  initialPrerequisites,
}: Props) {
  const { walletSelector } = useWalletSelector();
  const { accountId: signedAccountId, syncFromSelectorStore } =
    useNearWalletAccountId();
  const [terms, setTerms] = useState<EngagementFundingPrepareResult | null>(
    initialTerms,
  );
  const [prerequisites, setPrerequisites] =
    useState<EngagementFundingPrerequisites | null>(initialPrerequisites);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<string | null>(null);

  const requesterLinked = prerequisites
    ? prerequisites.requesterWalletLinked
    : linkedRequesterNearAccountId != null;
  const providerLinked = prerequisites?.providerWalletLinked === true;
  const requesterNear =
    prerequisites?.requesterNearAccountId ?? linkedRequesterNearAccountId;
  const providerName =
    prerequisites?.providerDisplayName ?? "your provider";

  const refreshPrerequisites = useCallback(async () => {
    const res = await loadEngagementFundingPrerequisites(engagementId);
    if (res.ok) {
      setPrerequisites(res.data);
    }
  }, [engagementId]);

  useEffect(() => {
    void refreshPrerequisites();
    const onFocus = () => void refreshPrerequisites();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refreshPrerequisites]);

  const networkId = parseNearNetworkId(process.env.NEXT_PUBLIC_NEAR_NETWORK_ID);

  const displayAmount = useMemo(() => {
    if (!terms) {
      return "";
    }
    return formatSmallestUnits(terms.amountSmallestUnits, terms.decimals);
  }, [terms]);

  const fundTxExplorer = terms?.fundTxHash
    ? explorerTransactionUrl(networkId, terms.fundTxHash)
    : null;
  const createTxExplorer = terms?.createTxHash
    ? explorerTransactionUrl(networkId, terms.createTxHash)
    : null;

  const walletMatchesLink =
    !linkedRequesterNearAccountId ||
    !signedAccountId ||
    signedAccountId.toLowerCase() ===
      linkedRequesterNearAccountId.toLowerCase();

  const connectWallet = useCallback(async () => {
    setError(null);
    try {
      const selector = await walletSelector;
      if (!selector) {
        throw new Error("Wallet is still loading.");
      }
      assertIntearWalletModule(selector);
      const contractId = readWalletContractId({
        NEXT_PUBLIC_NEAR_CONTRACT_ID:
          process.env.NEXT_PUBLIC_NEAR_ESCROW_CONTRACT_ID ??
          process.env.NEXT_PUBLIC_NEAR_CONTRACT_ID,
      });
      await signInWithIntearWallet(selector, contractId);
      await syncFromSelectorStore();
    } catch (e) {
      setError(formatWalletConnectionError(e));
    }
  }, [walletSelector, syncFromSelectorStore]);

  const refreshTerms = useCallback(async () => {
    const res = await prepareEngagementFunding(engagementId);
    if (res.ok) {
      setTerms(res.payment);
    }
    return res;
  }, [engagementId]);

  const runFunding = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const balance = await checkRequesterFundingBalance(engagementId);
      if (!balance.ok) {
        throw new Error(balance.error);
      }

      const prep = await refreshTerms();
      if (!prep.ok) {
        throw new Error(prep.error);
      }
      let current = prep.payment;

      if (current.status === "funded") {
        setTerms(current);
        return;
      }

      const selector = await walletSelector;
      if (!selector || !signedAccountId) {
        throw new Error("Connect your linked NEAR wallet first.");
      }
      if (!walletMatchesLink) {
        throw new Error(
          `Connected wallet must be ${linkedRequesterNearAccountId}.`,
        );
      }

      const wallet = await selector.wallet();
      if (!wallet) {
        throw new Error("Wallet unavailable.");
      }

      let onChainEscrowId = current.onChainEscrowId;

      if (!onChainEscrowId) {
        const synced = await syncEngagementEscrowFromChain(engagementId);
        if (synced.ok) {
          current = synced.payment;
          onChainEscrowId = current.onChainEscrowId;
          setTerms(current);
        }
      }

      if (!onChainEscrowId) {
        setStep("Creating escrow on-chain…");
        const createTx = await sendCreateEscrowTransaction(wallet, current);
        if (!createTx.txHash) {
          throw new Error("Create transaction did not return a hash.");
        }
        let claimedEscrowId: string | undefined;
        try {
          claimedEscrowId = parseEscrowIdFromCreateOutcome(
            normalizeTransactionOutcome(createTx.outcome),
          );
        } catch {
          claimedEscrowId = undefined;
        }
        const reported = await reportEngagementCreateTx(
          engagementId,
          createTx.txHash,
          claimedEscrowId,
          signedAccountId ?? undefined,
        );
        if (!reported.ok) {
          throw new Error(reported.error);
        }
        current = reported.payment;
        onChainEscrowId = current.onChainEscrowId;
        setTerms(current);
      }

      if (!onChainEscrowId) {
        throw new Error("Missing on-chain escrow id.");
      }

      if (current.status !== "funded") {
        setStep("Funding escrow…");
        const fundTx = await sendFundEscrowTransaction(
          wallet,
          current,
          onChainEscrowId,
        );
        if (!fundTx.txHash) {
          throw new Error("Fund transaction did not return a hash.");
        }
        const verified = await reportEngagementFundTx(
          engagementId,
          fundTx.txHash,
        );
        if (!verified.ok) {
          throw new Error(verified.error);
        }
        setTerms(verified.payment);
      }

      setStep(null);
    } catch (e) {
      const raw = e instanceof Error ? e.message : "Funding failed.";
      setError(formatEngagementFundingError(raw));
      setStep(null);
    } finally {
      setBusy(false);
    }
  }, [
    engagementId,
    refreshTerms,
    signedAccountId,
    walletMatchesLink,
    linkedRequesterNearAccountId,
    walletSelector,
  ]);

  if (!requesterLinked) {
    return (
      <div className="rounded-lg border border-stone-200 p-4 text-sm dark:border-stone-800">
        <p className="font-medium">Link your NEAR wallet</p>
        <p className="mt-1 text-stone-600 dark:text-stone-400">
          Open <strong>Account → NEAR wallet</strong>, connect Intear, then
          complete <strong>Link wallet</strong> (signed message). Connecting
          Intear on this page alone is not enough.
        </p>
      </div>
    );
  }

  if (!providerLinked) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
        <p className="font-medium">Waiting on provider wallet</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            You (requester): linked
            {requesterNear ? (
              <>
                {" "}
                as <span className="font-mono">{requesterNear}</span>
              </>
            ) : null}
          </li>
          <li>
            <strong>{providerName}</strong> (provider): not linked yet
          </li>
        </ul>
        <p className="mt-2">
          Escrow pays the <strong>provider&apos;s</strong> linked account, not
          yours. Sign in as <strong>{providerName}</strong>, use Account → NEAR
          wallet → connect + <strong>Link wallet</strong>, then refresh this
          page.
        </p>
        <button
          type="button"
          className="mt-3 text-sm underline"
          onClick={() => void refreshPrerequisites()}
        >
          Check again
        </button>
      </div>
    );
  }

  if (terms?.status === "funded") {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm dark:border-emerald-900 dark:bg-emerald-950/40">
        <p className="font-medium text-emerald-900 dark:text-emerald-100">
          Funded — {displayAmount} {terms.symbol}
        </p>
        {fundTxExplorer && (
          <a
            href={fundTxExplorer}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-block underline"
          >
            View funding transaction
          </a>
        )}
        {terms.fundTxHash && !fundTxExplorer && (
          <p className="mt-2 font-mono text-xs">{terms.fundTxHash}</p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-stone-200 p-4 dark:border-stone-800">
      <div>
        <h2 className="text-lg font-medium">Fund engagement</h2>
        <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
          Escrow holds {displayAmount || "—"} {terms?.symbol ?? ""} until you
          approve delivery.
        </p>
      </div>

      {terms?.status === "failed" && (
        <p className="text-sm text-red-600 dark:text-red-400">
          Last attempt failed. You can retry funding below.
        </p>
      )}

      {step && (
        <p className="text-sm text-stone-600 dark:text-stone-400">{step}</p>
      )}

      {!signedAccountId && (
        <button
          type="button"
          onClick={() => void connectWallet()}
          className="w-fit rounded-lg border border-stone-300 px-4 py-2 text-sm dark:border-stone-700"
        >
          Connect NEAR wallet
        </button>
      )}

      {signedAccountId && !walletMatchesLink && (
        <p className="text-sm text-amber-700 dark:text-amber-300">
          Connected as {signedAccountId}. Use linked account{" "}
          {linkedRequesterNearAccountId}.
        </p>
      )}

      <button
        type="button"
        disabled={busy}
        onClick={() => void runFunding()}
        className="w-fit rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-[#edf2ed] dark:text-[#101614]"
      >
        {busy ? "Working…" : "Fund engagement"}
      </button>

      {createTxExplorer && (
        <a
          href={createTxExplorer}
          target="_blank"
          rel="noreferrer"
          className="text-sm underline"
        >
          View create escrow transaction
        </a>
      )}

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  );
}

export function EngagementFundingSection(props: Props) {
  return (
    <NearSessionProvider>
      <FundingSectionInner {...props} />
    </NearSessionProvider>
  );
}
