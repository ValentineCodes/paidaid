"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useWalletSelector } from "@near-wallet-selector/react-hook";
import { parseNearNetworkId } from "@paidaid/shared";
import {
  explorerTransactionUrl,
  normalizeTransactionOutcome,
  parseEscrowIdFromCreateOutcome,
} from "@paidaid/near";

import { NearSessionProvider } from "../../../../wallet/near-session-provider";
import { useNearWalletAccountId } from "../../../../wallet/use-near-wallet-account";
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
  checkAcceptanceFundingBalance,
  issueAcceptanceEscrowCreateAuthorization,
  prepareAcceptanceFunding,
  reportAcceptanceCreateTx,
  reportAcceptanceFundTx,
  reconcileAcceptanceFinalization,
  syncAcceptanceEscrowFromChain,
  loadActiveAcceptanceFundingForResponse,
} from "../acceptance-funding-actions";
import { acceptanceIntentToWalletTerms } from "../../../../lib/acceptance/acceptance-intent-wallet-terms";
import type { AcceptanceFundingPrepareResult } from "../../../../lib/acceptance/acceptance-funding-types";
import { formatAcceptanceFundingError } from "../../../../lib/acceptance/acceptance-funding-errors";
import {
  acceptanceFundingPhaseLabel,
  blocksDuplicateFundingAttempt,
  canRetryAcceptanceFunding,
  deriveAcceptanceFundingUiPhase,
  shouldShowContinueFunding,
} from "../../../../lib/acceptance/acceptance-funding-ui";

type Props = {
  requestId: string;
  responseId: string;
  providerDisplayName: string;
  offerAmountDisplay: string;
  assetSymbol: string;
  linkedRequesterNearAccountId: string | null;
  /** Another provider's acceptance funding is in flight for this request. */
  anotherAcceptanceInProgress: boolean;
  variant?: "drawer" | "page";
};

function StatusBanner({
  phase,
  busy,
  label,
}: {
  phase: string;
  busy: boolean;
  label: string;
}) {
  if (!label && !busy) return null;
  const tone =
    phase === "succeeded"
      ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100"
      : phase === "failed" ||
          phase === "wallet_rejected" ||
          phase === "expired"
        ? "border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100"
        : "text-on-light-surface border-stone-200 bg-stone-50 dark:border-stone-700 dark:bg-stone-900/50";

  return (
    <div
      className={`rounded-lg border px-3 py-2 text-sm ${tone}`}
      role="status"
      aria-live="polite"
    >
      {busy && (
        <span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-current" />
      )}
      {label}
    </div>
  );
}

function AcceptResponseFormInner({
  requestId,
  responseId,
  providerDisplayName,
  offerAmountDisplay,
  assetSymbol,
  linkedRequesterNearAccountId,
  anotherAcceptanceInProgress,
  variant = "page",
}: Props) {
  const router = useRouter();
  const { walletSelector } = useWalletSelector();
  const { accountId: signedAccountId, syncFromSelectorStore } =
    useNearWalletAccountId();
  const [intent, setIntent] = useState<AcceptanceFundingPrepareResult | null>(
    null,
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeStep, setActiveStep] = useState<string | null>(null);
  const [finalizedEngagementId, setFinalizedEngagementId] = useState<
    string | null
  >(null);
  const [hydrated, setHydrated] = useState(false);
  const runGuard = useRef(false);

  const networkId = parseNearNetworkId(process.env.NEXT_PUBLIC_NEAR_NETWORK_ID);

  const walletMatchesLink =
    !linkedRequesterNearAccountId ||
    !signedAccountId ||
    signedAccountId.toLowerCase() ===
      linkedRequesterNearAccountId.toLowerCase();

  const viewState = useMemo(
    () => ({
      confirmOpen,
      busy,
      activeStep,
      lastError: error,
      finalizedEngagementId,
    }),
    [confirmOpen, busy, activeStep, error, finalizedEngagementId],
  );

  const phase = deriveAcceptanceFundingUiPhase(intent, viewState);
  const phaseLabel =
    busy && activeStep
      ? activeStep
      : acceptanceFundingPhaseLabel(phase) || null;

  const refreshSnapshot = useCallback(async () => {
    const snap = await loadActiveAcceptanceFundingForResponse(
      requestId,
      responseId,
    );
    if (!snap.ok) return;
    if (snap.intent) {
      setIntent(snap.intent);
      if (snap.intent.status === "finalized") {
        setFinalizedEngagementId(snap.intent.plannedEngagementId);
        setConfirmOpen(false);
      }
    }
  }, [requestId, responseId]);

  useEffect(() => {
    void refreshSnapshot().finally(() => setHydrated(true));
  }, [refreshSnapshot]);

  useEffect(() => {
    const onFocus = () => void refreshSnapshot();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refreshSnapshot]);

  const connectWallet = useCallback(async () => {
    setError(null);
    try {
      const selector = await walletSelector;
      if (!selector) throw new Error("Wallet is still loading.");
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

  const executeWalletFunding = useCallback(
    async (starting: AcceptanceFundingPrepareResult) => {
      const balance = await checkAcceptanceFundingBalance(starting.intentId);
      if (!balance.ok) {
        throw new Error(balance.error);
      }

      const selector = await walletSelector;
      if (!selector || !signedAccountId) {
        throw new Error("Connect your linked NEAR wallet to continue.");
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

      let current = starting;
      let onChainEscrowId = current.onChainEscrowId;

      if (!onChainEscrowId) {
        setActiveStep("Verifying escrow on-chain…");
        const synced = await syncAcceptanceEscrowFromChain(current.intentId);
        if (synced.ok) {
          current = synced.intent;
          onChainEscrowId = current.onChainEscrowId;
          setIntent(current);
          if (current.status === "finalized") {
            setFinalizedEngagementId(current.plannedEngagementId);
            return;
          }
        }
      }

      if (!onChainEscrowId) {
        setActiveStep("Waiting for wallet approval (create escrow)…");
        const auth = await issueAcceptanceEscrowCreateAuthorization(
          current.intentId,
        );
        if (!auth.ok) {
          throw new Error(auth.error);
        }
        const createTx = await sendCreateEscrowTransaction(
          wallet,
          acceptanceIntentToWalletTerms(current),
          auth.authorization,
        );
        if (!createTx.txHash) {
          throw new Error("Create transaction did not return a hash.");
        }
        setActiveStep("Transaction submitted — verifying on-chain…");
        let claimedEscrowId: string | undefined;
        try {
          claimedEscrowId = parseEscrowIdFromCreateOutcome(
            normalizeTransactionOutcome(createTx.outcome),
          );
        } catch {
          claimedEscrowId = undefined;
        }
        const reported = await reportAcceptanceCreateTx(
          current.intentId,
          createTx.txHash,
          claimedEscrowId,
          signedAccountId ?? undefined,
        );
        if (!reported.ok) {
          throw new Error(reported.error);
        }
        current = reported.intent;
        onChainEscrowId = current.onChainEscrowId;
        setIntent(current);
      }

      if (!onChainEscrowId) {
        throw new Error("Missing on-chain escrow id.");
      }

      if (
        current.status !== "finalized" &&
        current.status !== "funding_verified"
      ) {
        setActiveStep("Waiting for wallet approval (fund escrow)…");
        const fundTx = await sendFundEscrowTransaction(
          wallet,
          acceptanceIntentToWalletTerms(current),
          onChainEscrowId,
        );
        if (!fundTx.txHash) {
          throw new Error("Fund transaction did not return a hash.");
        }
        setActiveStep("Verifying funding on-chain…");
        const verified = await reportAcceptanceFundTx(
          current.intentId,
          fundTx.txHash,
        );
        if (!verified.ok) {
          throw new Error(verified.error);
        }
        setIntent(verified.intent);
        setFinalizedEngagementId(verified.engagementId);
      } else {
        setActiveStep("Finalizing acceptance…");
        const recovered = await reconcileAcceptanceFinalization(current.intentId);
        if (recovered.ok) {
          setFinalizedEngagementId(recovered.engagementId);
          setIntent(recovered.intent);
        }
      }
    },
    [
      walletSelector,
      signedAccountId,
      walletMatchesLink,
      linkedRequesterNearAccountId,
    ],
  );

  const runFundingFlow = useCallback(
    async (options: { skipPrepare?: boolean }) => {
      if (runGuard.current) return;
      runGuard.current = true;
      setError(null);
      setBusy(true);
      try {
        let current = intent;
        if (!options.skipPrepare || !current) {
          setActiveStep("Preparing acceptance…");
          const prep = await prepareAcceptanceFunding(requestId, responseId);
          if (!prep.ok) {
            throw new Error(prep.error);
          }
          current = prep.intent;
          setIntent(current);
          setConfirmOpen(false);
        }

        if (current.status === "finalized") {
          setFinalizedEngagementId(current.plannedEngagementId);
          router.refresh();
          return;
        }

        await executeWalletFunding(current);
        setActiveStep(null);
        router.refresh();
      } catch (e) {
        const raw = e instanceof Error ? e.message : "Acceptance funding failed.";
        setError(formatAcceptanceFundingError(raw));
        setActiveStep(null);
        await refreshSnapshot();
      } finally {
        setBusy(false);
        runGuard.current = false;
      }
    },
    [
      intent,
      requestId,
      responseId,
      executeWalletFunding,
      router,
      refreshSnapshot,
    ],
  );

  const fundTxExplorer =
    intent?.fundTxHash != null
      ? explorerTransactionUrl(networkId, intent.fundTxHash)
      : null;
  const createTxExplorer =
    intent?.createTxHash != null
      ? explorerTransactionUrl(networkId, intent.createTxHash)
      : null;

  const walletRequired = linkedRequesterNearAccountId == null;
  const blocked =
    anotherAcceptanceInProgress && !intent && phase === "idle";
  const duplicateBlocked = blocksDuplicateFundingAttempt(phase, busy);

  const compactIdleBar =
    (phase === "idle" && !finalizedEngagementId) ||
    (!hydrated && phase === "idle");

  if (!hydrated) {
    return (
      <p className="text-xs text-stone-500 dark:text-stone-400">
        Loading acceptance status…
      </p>
    );
  }

  return (
    <div
      className={
        compactIdleBar
          ? "flex w-fit shrink-0 flex-col gap-2"
          : "flex w-full max-w-md flex-col gap-2"
      }
    >
      {phase !== "idle" && phase !== "confirm" && (
        <StatusBanner phase={phase} busy={busy} label={phaseLabel ?? ""} />
      )}

      {phase === "succeeded" && finalizedEngagementId && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-emerald-800 dark:text-emerald-200">
            {providerDisplayName}&apos;s offer is accepted. Escrow is funded on{" "}
            {networkId}.
          </p>
          <Link
            href={`/engagements/${finalizedEngagementId}`}
            className="btn-ink w-fit rounded-lg px-3 py-2 text-sm font-medium"
          >
            Open engagement
          </Link>
        </div>
      )}

      {phase === "confirm" && (
        <div className="flex flex-col gap-3 rounded-lg border border-stone-200 p-3 dark:border-stone-700">
          <p className="text-on-light-surface text-sm">
            Accepting <strong>{providerDisplayName}</strong> requires funding{" "}
            <strong>
              {offerAmountDisplay} {assetSymbol}
            </strong>{" "}
            into escrow on NEAR ({networkId}). The offer stays pending until
            funding is verified on-chain — not when you sign.
          </p>
          {walletRequired ? (
            <p className="text-sm text-amber-800 dark:text-amber-200">
              Link your NEAR wallet under{" "}
              <Link href="/account" className="underline">
                Account
              </Link>{" "}
              before continuing.
            </p>
          ) : (
            <p className="text-xs text-stone-600 dark:text-stone-400">
              Funding wallet (request snapshot): {linkedRequesterNearAccountId}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || walletRequired}
              onClick={() => void runFundingFlow({ skipPrepare: false })}
              className="btn-ink rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-60"
            >
              Confirm and fund escrow
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setConfirmOpen(false);
                setError(null);
              }}
              className="rounded-lg border border-stone-300 px-3 py-2 text-sm dark:border-stone-600"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {phase === "idle" && !finalizedEngagementId && (
        <>
          <button
            type="button"
            disabled={blocked || walletRequired}
            onClick={() => {
              setError(null);
              setConfirmOpen(true);
            }}
            className={
              variant === "drawer"
                ? "primary w-fit shrink-0"
                : "btn-ink w-fit shrink-0 rounded-lg px-3 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-60"
            }
          >
            Accept
          </button>
          {blocked && (
            <p className="text-xs text-stone-600 dark:text-stone-400">
              Another acceptance is in progress for this request. Finish or
              cancel that flow first.
            </p>
          )}
          {walletRequired && (
            <p className="text-xs text-amber-800 dark:text-amber-200">
              <Link href="/account" className="underline">
                Link a NEAR wallet
              </Link>{" "}
              to accept with escrow.
            </p>
          )}
        </>
      )}

      {shouldShowContinueFunding(phase, Boolean(intent)) && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-stone-600 dark:text-stone-400">
            Escrow funding in progress. The offer is not accepted until
            verification completes.
          </p>
          {!signedAccountId && !walletRequired && (
            <button
              type="button"
              onClick={() => void connectWallet()}
              className="w-fit rounded-lg border border-stone-300 px-3 py-2 text-sm dark:border-stone-700"
            >
              Connect NEAR wallet
            </button>
          )}
          {signedAccountId && !walletMatchesLink && (
            <p className="text-sm text-amber-700 dark:text-amber-300">
              Connected as {signedAccountId}. Use {linkedRequesterNearAccountId}.
            </p>
          )}
          <button
            type="button"
            disabled={duplicateBlocked || walletRequired}
            onClick={() =>
              void runFundingFlow({ skipPrepare: Boolean(intent) })
            }
            className="btn-ink w-fit rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-60"
          >
            {busy ? (activeStep ?? "Working…") : "Continue funding"}
          </button>
        </div>
      )}

      {canRetryAcceptanceFunding(phase) && !busy && (
        <button
          type="button"
          onClick={() => {
            setError(null);
            setIntent(null);
            setConfirmOpen(true);
          }}
          className="w-fit text-sm font-medium underline"
        >
          Try acceptance again
        </button>
      )}

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
      {fundTxExplorer && (
        <a
          href={fundTxExplorer}
          target="_blank"
          rel="noreferrer"
          className="text-sm underline"
        >
          View fund transaction
        </a>
      )}

      {error && (
        <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
      )}
    </div>
  );
}

export function AcceptResponseForm(props: Props) {
  return (
    <NearSessionProvider>
      <AcceptResponseFormInner {...props} />
    </NearSessionProvider>
  );
}
