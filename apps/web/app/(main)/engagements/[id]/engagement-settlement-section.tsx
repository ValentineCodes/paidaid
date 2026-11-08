"use client";

import { useCallback, useState } from "react";
import { useWalletSelector } from "@near-wallet-selector/react-hook";
import { explorerTransactionUrl } from "@paidaid/near";
import { parseNearNetworkId } from "@paidaid/shared";
import { NearSessionProvider } from "../../../../wallet/near-session-provider";
import { useNearWalletAccountId } from "../../../../wallet/use-near-wallet-account";
import {
  assertIntearWalletModule,
  signInWithIntearWallet,
} from "../../../../wallet/connect-intear";
import { readWalletContractId } from "../../../../wallet/config";
import { formatWalletConnectionError } from "../../../../wallet/errors";
import { sendReleaseEscrowTransaction } from "../../../../wallet/send-escrow-release";
import {
  loadEngagementSettlementView,
  reportEngagementReleaseTx,
} from "../engagement-settlement-actions";
import type { EngagementSettlementView } from "../../../../lib/engagement/settlement-types";

type Props = {
  engagementId: string;
  isRequester: boolean;
  linkedRequesterNearAccountId: string | null;
  initialSettlement: EngagementSettlementView | null;
};

function SettlementSectionInner({
  engagementId,
  isRequester,
  linkedRequesterNearAccountId,
  initialSettlement,
}: Props) {
  const { walletSelector } = useWalletSelector();
  const { accountId: signedAccountId, syncFromSelectorStore } =
    useNearWalletAccountId();
  const [settlement, setSettlement] = useState(initialSettlement);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const networkId = parseNearNetworkId(process.env.NEXT_PUBLIC_NEAR_NETWORK_ID);

  const walletMatchesLink =
    !linkedRequesterNearAccountId ||
    !signedAccountId ||
    signedAccountId.toLowerCase() === linkedRequesterNearAccountId.toLowerCase();

  const refresh = useCallback(async () => {
    const res = await loadEngagementSettlementView(engagementId);
    if (res.ok) {
      setSettlement(res.settlement);
    }
  }, [engagementId]);

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

  const runRelease = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const selector = await walletSelector;
      if (!selector || !signedAccountId) {
        throw new Error("Connect your linked NEAR wallet first.");
      }
      if (!walletMatchesLink) {
        throw new Error(`Connected wallet must be ${linkedRequesterNearAccountId}.`);
      }
      if (!settlement?.onChainEscrowId || !settlement.escrowContractId) {
        throw new Error("Escrow metadata missing.");
      }

      const wallet = await selector.wallet();
      if (!wallet) {
        throw new Error("Wallet unavailable.");
      }

      const tx = await sendReleaseEscrowTransaction(
        wallet,
        settlement.escrowContractId,
        settlement.onChainEscrowId,
      );
      if (!tx.txHash) {
        throw new Error("Release transaction did not return a hash.");
      }

      const reported = await reportEngagementReleaseTx(engagementId, tx.txHash);
      if (!reported.ok) {
        throw new Error(reported.error);
      }
      setSettlement(reported.settlement);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Release failed.");
    } finally {
      setBusy(false);
    }
  }, [
    engagementId,
    settlement,
    signedAccountId,
    walletMatchesLink,
    linkedRequesterNearAccountId,
    walletSelector,
  ]);

  if (!settlement?.paymentFunded) {
    return null;
  }

  const releaseExplorer = settlement.releaseTxHash
    ? explorerTransactionUrl(networkId, settlement.releaseTxHash)
    : null;

  if (settlement.settlementStatus === "released") {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm dark:border-emerald-900 dark:bg-emerald-950/40">
        <p className="font-medium text-emerald-900 dark:text-emerald-100">
          Payment released to provider
        </p>
        {releaseExplorer && (
          <a
            href={releaseExplorer}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-block underline"
          >
            View release transaction
          </a>
        )}
      </div>
    );
  }

  if (!isRequester) {
    if (
      settlement.settlementStatus === "eligible" ||
      settlement.settlementStatus === "release_submitted" ||
      settlement.settlementStatus === "release_failed"
    ) {
      return (
        <div className="rounded-lg border border-stone-200 p-4 text-sm dark:border-stone-800">
          <p className="font-medium">Awaiting payment release</p>
          <p className="mt-1 text-stone-600 dark:text-stone-400">
            The requester must sign a NEAR transaction to release escrow to your
            linked wallet. The engagement completes after release is verified.
          </p>
        </div>
      );
    }
    return null;
  }

  if (
    settlement.settlementStatus !== "eligible" &&
    settlement.settlementStatus !== "release_failed" &&
    settlement.settlementStatus !== "release_submitted"
  ) {
    return null;
  }

  return (
    <div className="rounded-lg border border-stone-200 p-4 text-sm dark:border-stone-800">
      <p className="font-medium">Release escrow to provider</p>
      <p className="mt-1 text-stone-600 dark:text-stone-400">
        Delivery is approved. Sign with your linked NEAR wallet to pay the
        provider and complete this engagement.
      </p>
      {settlement.settlementLastError && (
        <p className="mt-2 text-red-700 dark:text-red-300">
          {settlement.settlementLastError}
        </p>
      )}
      {error && (
        <p className="mt-2 text-red-700 dark:text-red-300">{error}</p>
      )}
      {!signedAccountId && (
        <button
          type="button"
          className="mt-3 rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white dark:bg-[#edf2ed] dark:text-[#101614]"
          onClick={() => void connectWallet()}
          disabled={busy}
        >
          Connect wallet
        </button>
      )}
      {signedAccountId && (
        <button
          type="button"
          className="mt-3 rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-[#edf2ed] dark:text-[#101614]"
          onClick={() => void runRelease()}
          disabled={busy}
        >
          {busy ? "Releasing…" : "Release payment"}
        </button>
      )}
      <button
        type="button"
        className="ml-3 mt-3 text-sm underline"
        onClick={() => void refresh()}
        disabled={busy}
      >
        Refresh status
      </button>
    </div>
  );
}

export function EngagementSettlementSection(props: Props) {
  return (
    <NearSessionProvider>
      <SettlementSectionInner {...props} />
    </NearSessionProvider>
  );
}
