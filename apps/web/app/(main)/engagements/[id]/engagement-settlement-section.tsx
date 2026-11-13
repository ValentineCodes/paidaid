"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { explorerTransactionUrl } from "@paidaid/near";
import { AppToast } from "../../../../components/app-toast";
import { FigmaIcon } from "../../../../components/figma-icons";
import { defaultRpcUrlForNetwork, parseNearNetworkId } from "@paidaid/shared";
import { NearSessionProvider } from "../../../../wallet/near-session-provider";
import { useNearWalletAccountId } from "../../../../wallet/use-near-wallet-account";
import { usePaidAidNearWallet } from "../../../../wallet/paidaid-near-wallet-context";
import { useOpenNearWalletConnect } from "../../../../wallet/use-open-near-wallet-connect";
import { formatWalletConnectionError } from "../../../../wallet/errors";
import {
  formatNearTransactionError,
  isUserRejectedTransaction,
} from "../../../../wallet/near-transaction-errors";
import {
  checkEngagementReleasePreflight,
  loadEngagementSettlementView,
  reportEngagementReleaseTx,
  type EngagementReleasePreflightResult,
} from "../engagement-settlement-actions";
import { sendNep141StorageDeposit } from "../../../../wallet/send-nep141-storage-deposit";
import type { EngagementSettlementView } from "../../../../lib/engagement/settlement-types";
import { releaseEscrowForEngagement } from "../../../../lib/engagement/release-escrow-client";
import type { Database } from "../../../../lib/database.types";

type DeliveryStatus = Database["public"]["Enums"]["delivery_status"] | null;

type Props = {
  engagementId: string;
  isRequester: boolean;
  linkedRequesterNearAccountId: string | null;
  linkedProviderNearAccountId: string | null;
  initialSettlement: EngagementSettlementView | null;
  deliveryStatus: DeliveryStatus;
};

function SettlementSectionInner({
  engagementId,
  isRequester,
  linkedRequesterNearAccountId,
  linkedProviderNearAccountId,
  initialSettlement,
  deliveryStatus,
}: Props) {
  const router = useRouter();
  const { getTransactionSigner } = usePaidAidNearWallet();
  const openConnect = useOpenNearWalletConnect();
  const { accountId: signedAccountId, syncFromSelectorStore } =
    useNearWalletAccountId();
  const [settlement, setSettlement] = useState(initialSettlement);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorToastOpen, setErrorToastOpen] = useState(false);
  const [errorToastMessage, setErrorToastMessage] = useState("");
  const [providerPreflight, setProviderPreflight] =
    useState<EngagementReleasePreflightResult | null>(null);
  const [providerPreflightChecked, setProviderPreflightChecked] =
    useState(false);
  const networkId = parseNearNetworkId(process.env.NEXT_PUBLIC_NEAR_NETWORK_ID);
  const nearConfig = {
    networkId,
    rpcUrl:
      process.env.NEXT_PUBLIC_NEAR_RPC_URL?.trim() ||
      defaultRpcUrlForNetwork(networkId),
  };

  const walletMatchesLink =
    !linkedRequesterNearAccountId ||
    !signedAccountId ||
    signedAccountId.toLowerCase() === linkedRequesterNearAccountId.toLowerCase();

  const providerWalletMatchesLink =
    !linkedProviderNearAccountId ||
    !signedAccountId ||
    signedAccountId.toLowerCase() === linkedProviderNearAccountId.toLowerCase();

  useEffect(() => {
    setSettlement(initialSettlement);
  }, [initialSettlement]);

  const connectWallet = useCallback(async () => {
    setError(null);
    try {
      await openConnect();
      await syncFromSelectorStore();
    } catch (e) {
      setError(formatWalletConnectionError(e));
    }
  }, [openConnect, syncFromSelectorStore]);

  const runRelease = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      if (!signedAccountId) {
        throw new Error("Connect your linked NEAR wallet first.");
      }
      if (!walletMatchesLink) {
        throw new Error(`Connected wallet must be ${linkedRequesterNearAccountId}.`);
      }
      if (!settlement?.onChainEscrowId || !settlement.escrowContractId) {
        throw new Error("Escrow metadata missing.");
      }

      const preflight = await checkEngagementReleasePreflight(engagementId);
      if (!preflight.ok) {
        throw new Error(preflight.error);
      }

      if (settlement.releaseTxHash) {
        const existing = await reportEngagementReleaseTx(
          engagementId,
          settlement.releaseTxHash,
        );
        if (existing.ok) {
          setSettlement(existing.settlement);
          return;
        }
        const payoutStillOpen =
          existing.error.includes("Release did not complete") ||
          existing.error.includes("Escrow is not released") ||
          existing.error.includes("Timed out waiting for escrow release");
        if (!payoutStillOpen) {
          throw new Error(existing.error);
        }
      }

      const signer = await getTransactionSigner();

      const reported = await releaseEscrowForEngagement(
        engagementId,
        signer,
        settlement,
        { requesterNearAccountId: linkedRequesterNearAccountId },
      );
      if (!reported.ok) {
        throw new Error(reported.error);
      }
      setSettlement(reported.settlement);
    } catch (e) {
      const message = formatNearTransactionError(e);
      if (isUserRejectedTransaction(e)) {
        setError(null);
        setErrorToastMessage(message);
        setErrorToastOpen(true);
      } else {
        setError(message);
      }
      const res = await loadEngagementSettlementView(engagementId);
      if (res.ok) {
        setSettlement(res.settlement);
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }, [
    engagementId,
    settlement,
    signedAccountId,
    walletMatchesLink,
    linkedRequesterNearAccountId,
    getTransactionSigner,
    router,
  ]);

  const refreshProviderPreflight = useCallback(async () => {
    const pre = await checkEngagementReleasePreflight(engagementId);
    if (!pre.ok && pre.registrationActor === "provider") {
      setProviderPreflight(pre);
    } else {
      setProviderPreflight(null);
    }
    setProviderPreflightChecked(true);
  }, [engagementId]);

  const registerProviderTokenStorage = useCallback(async () => {
    if (
      !providerPreflight ||
      providerPreflight.ok ||
      !providerPreflight.storageDepositYocto ||
      !providerPreflight.tokenContractId
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (!signedAccountId) {
        throw new Error("Connect your linked NEAR wallet first.");
      }
      if (!providerWalletMatchesLink) {
        throw new Error(
          `Connected wallet must be ${linkedProviderNearAccountId}.`,
        );
      }
      const signer = await getTransactionSigner();
      const deposited = await sendNep141StorageDeposit(
        signer,
        nearConfig,
        providerPreflight.tokenContractId,
        BigInt(providerPreflight.storageDepositYocto),
      );
      if (!deposited.ok) {
        throw new Error(deposited.error);
      }
      await refreshProviderPreflight();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Registration failed.");
    } finally {
      setBusy(false);
    }
  }, [
    providerPreflight,
    signedAccountId,
    providerWalletMatchesLink,
    linkedProviderNearAccountId,
    getTransactionSigner,
    nearConfig,
    refreshProviderPreflight,
  ]);

  useEffect(() => {
    if (isRequester || !settlement?.paymentFunded) {
      return;
    }
    const awaitingRelease =
      settlement.settlementStatus === "eligible" ||
      settlement.settlementStatus === "release_submitted" ||
      settlement.settlementStatus === "release_failed";
    if (!awaitingRelease) {
      return;
    }
    setProviderPreflightChecked(false);
    void refreshProviderPreflight();
  }, [
    isRequester,
    settlement?.paymentFunded,
    settlement?.settlementStatus,
    refreshProviderPreflight,
  ]);

  if (!settlement?.paymentFunded) {
    return null;
  }

  const releaseExplorer = settlement.releaseTxHash
    ? explorerTransactionUrl(networkId, settlement.releaseTxHash)
    : null;

  if (settlement.settlementStatus === "released") {
    const releasedLabel = settlement.releasedAt
      ? new Date(settlement.releasedAt).toLocaleString(undefined, {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })
      : null;

    return (
      <div className="accept-funding-success" role="status">
        <div className="accept-funding-success__icon" aria-hidden>
          <FigmaIcon name="check" size={22} />
        </div>
        <p className="accept-funding-success__lead">
          {isRequester
            ? "Payment released to your provider"
            : "Payment received from escrow"}
        </p>
        <p className="accept-funding-success__meta">
          {releasedLabel
            ? `Confirmed ${releasedLabel}`
            : "Escrow payout is complete on NEAR."}
        </p>
        {releaseExplorer ? (
          <a
            href={releaseExplorer}
            target="_blank"
            rel="noreferrer"
            className="accept-funding-success__tx"
          >
            View release transaction
          </a>
        ) : null}
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
        <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 text-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
            Payout
          </p>
          <h3 className="mt-1 text-base font-semibold text-[var(--ink)]">
            Awaiting payment release
          </h3>
          <p className="mt-2 text-[13px] leading-relaxed text-[var(--muted)]">
            The requester signs a NEAR transaction to send escrow to your linked
            wallet. The engagement completes after that release is verified.
          </p>
          {error ? (
            <p className="mt-3 text-[13px] text-red-700 dark:text-red-300" role="alert">
              {error}
            </p>
          ) : null}
          {!providerPreflightChecked ? (
            <p
              className="mt-4 text-[13px] text-[var(--muted)]"
              role="status"
              aria-live="polite"
            >
              Checking payout readiness…
            </p>
          ) : providerPreflight && !providerPreflight.ok ? (
            <div className="mt-4 rounded-xl border border-amber-200/80 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/30">
              <p className="text-[13px] leading-relaxed text-amber-950 dark:text-amber-100">
                {providerPreflight.error}
              </p>
              <button
                type="button"
                className="btn-ink mt-3 rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50"
                disabled={busy}
                onClick={() => void registerProviderTokenStorage()}
              >
                {busy
                  ? "Registering…"
                  : `Register to receive ${providerPreflight.assetSymbol ?? "tokens"}`}
              </button>
            </div>
          ) : null}
        </section>
      );
    }
    return null;
  }

  if (
    settlement.settlementStatus === "eligible" &&
    deliveryStatus === "pending_review"
  ) {
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
    <>
      <AppToast
        message={errorToastMessage}
        visible={errorToastOpen}
        onClose={() => setErrorToastOpen(false)}
        variant="error"
      />
      <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 text-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
        Settlement
      </p>
      <h3 className="mt-1 text-base font-semibold text-[var(--ink)]">
        Release payment
      </h3>
      <p className="mt-2 text-[13px] leading-relaxed text-[var(--muted)]">
        {settlement.settlementStatus === "release_failed"
          ? "The last release did not finish in PaidAid. We’ll confirm the existing transaction before asking you to sign again."
          : "Sign with your linked NEAR wallet to pay the provider and finish this engagement."}
      </p>
      {settlement.settlementLastError ? (
        <p className="mt-3 text-[13px] text-red-700 dark:text-red-300" role="alert">
          {settlement.settlementLastError}
        </p>
      ) : null}
      {error ? (
        <p className="mt-3 text-[13px] text-red-700 dark:text-red-300" role="alert">
          {error}
        </p>
      ) : null}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {!signedAccountId ? (
          <button
            type="button"
            className="btn-ink rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
            onClick={() => void connectWallet()}
            disabled={busy}
          >
            Connect wallet
          </button>
        ) : (
          <button
            type="button"
            className="btn-ink rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
            onClick={() => void runRelease()}
            disabled={busy}
          >
            {busy ? "Checking release…" : "Release payment"}
          </button>
        )}
      </div>
    </section>
    </>
  );
}

export function EngagementSettlementSection(props: Props) {
  return (
    <NearSessionProvider>
      <SettlementSectionInner {...props} />
    </NearSessionProvider>
  );
}
