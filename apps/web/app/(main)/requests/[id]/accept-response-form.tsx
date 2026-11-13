"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { AppToast } from "../../../../components/app-toast";
import { FigmaIcon } from "../../../../components/figma-icons";
import { defaultRpcUrlForNetwork, parseNearNetworkId } from "@paidaid/shared";
import {
  explorerTransactionUrl,
  normalizeTransactionOutcome,
  parseEscrowIdFromFundOutcome,
} from "@paidaid/near";

import { NearSessionProvider } from "../../../../wallet/near-session-provider";
import { useNearWalletAccountId } from "../../../../wallet/use-near-wallet-account";
import { formatWalletConnectionError } from "../../../../wallet/errors";
import { usePaidAidNearWallet } from "../../../../wallet/paidaid-near-wallet-context";
import { useOpenNearWalletConnect } from "../../../../wallet/use-open-near-wallet-connect";
import { sendFundEscrowTransaction } from "../../../../wallet/send-escrow-funding";
import { sendNep141StorageDeposit } from "../../../../wallet/send-nep141-storage-deposit";
import {
  checkAcceptanceFundingPreflight,
  type AcceptanceFundingPreflightResult,
  checkAcceptOfferEligibility,
  prepareAcceptanceFunding,
  recoverAcceptanceFundingProgress,
  reportAcceptanceFundTx,
  reconcileAcceptanceFinalization,
  loadActiveAcceptanceFundingForResponse,
  cancelAcceptanceFunding,
} from "../acceptance-funding-actions";
import { acceptanceIntentToWalletTerms } from "../../../../lib/acceptance/acceptance-intent-wallet-terms";
import type { AcceptanceFundingPrepareResult } from "../../../../lib/acceptance/acceptance-funding-types";
import {
  formatAcceptanceFundingError,
  isProviderActiveEngagementError,
  PROVIDER_ACTIVE_ENGAGEMENT_TOAST,
} from "../../../../lib/acceptance/acceptance-funding-errors";
import {
  acceptanceFundingPhaseLabel,
  blocksDuplicateFundingAttempt,
  canRetryAcceptanceFunding,
  deriveAcceptanceFundingUiPhase,
  shouldShowContinueFunding,
  canCancelAcceptanceFunding,
  acceptanceFundingNeedsOnChainRecovery,
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
      : phase === "failed" || phase === "wallet_rejected" || phase === "expired"
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
  const { getTransactionSigner } = usePaidAidNearWallet();
  const openConnect = useOpenNearWalletConnect();
  const { accountId: signedAccountId, syncFromSelectorStore } =
    useNearWalletAccountId();
  const [intent, setIntent] = useState<AcceptanceFundingPrepareResult | null>(
    null,
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeStep, setActiveStep] = useState<string | null>(null);
  const [finalizedEngagementId, setFinalizedEngagementId] = useState<
    string | null
  >(null);
  const [hydrated, setHydrated] = useState(false);
  const [acceptGateLoading, setAcceptGateLoading] = useState(false);
  const [blockToastOpen, setBlockToastOpen] = useState(false);
  const [blockToastMessage, setBlockToastMessage] = useState(
    PROVIDER_ACTIVE_ENGAGEMENT_TOAST,
  );
  const [registrationPreflight, setRegistrationPreflight] =
    useState<AcceptanceFundingPreflightResult | null>(null);
  const runGuard = useRef(false);

  const networkId = parseNearNetworkId(process.env.NEXT_PUBLIC_NEAR_NETWORK_ID);
  const nearConfig = useMemo(
    () => ({
      networkId,
      rpcUrl:
        process.env.NEXT_PUBLIC_NEAR_RPC_URL?.trim() ||
        defaultRpcUrlForNetwork(networkId),
    }),
    [networkId],
  );

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

  const showStatusBanner =
    phase !== "idle" &&
    phase !== "confirm" &&
    phase !== "succeeded" &&
    !busy &&
    Boolean(phaseLabel) &&
    !(
      error &&
      (phase === "wallet_rejected" ||
        phase === "failed" ||
        phase === "expired")
    );

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

  const resumeOpenGuard = useRef(false);
  useEffect(() => {
    if (!hydrated || resumeOpenGuard.current || modalOpen || variant === "drawer") {
      return;
    }
    if (
      intent &&
      shouldShowContinueFunding(phase, true) &&
      phase !== "succeeded"
    ) {
      resumeOpenGuard.current = true;
      setModalOpen(true);
    }
  }, [hydrated, intent, phase, modalOpen, variant]);

  useEffect(() => {
    const onFocus = () => void refreshSnapshot();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refreshSnapshot]);

  const connectWallet = useCallback(async () => {
    setError(null);
    try {
      await openConnect();
      await syncFromSelectorStore();
    } catch (e) {
      setError(formatWalletConnectionError(e));
    }
  }, [openConnect, syncFromSelectorStore]);

  const executeWalletFunding = useCallback(
    async (starting: AcceptanceFundingPrepareResult) => {
      const preflight = await checkAcceptanceFundingPreflight(starting.intentId);
      if (!preflight.ok) {
        if (
          preflight.code === "requester_not_registered" &&
          preflight.registrationActor === "requester" &&
          preflight.storageDepositYocto &&
          starting.tokenContractId
        ) {
          setRegistrationPreflight(preflight);
        }
        throw new Error(preflight.error);
      }
      setRegistrationPreflight(null);

      if (!signedAccountId) {
        throw new Error("Connect your linked NEAR wallet to continue.");
      }
      if (!walletMatchesLink) {
        throw new Error(
          `Connected wallet must be ${linkedRequesterNearAccountId}.`,
        );
      }

      const signer = await getTransactionSigner();

      let current = starting;

      if (
        current.status !== "finalized" &&
        current.status !== "funding_verified"
      ) {
        const needsWalletFund =
          !current.fundTxHash && !current.onChainEscrowId;

        if (!needsWalletFund) {
          setActiveStep("Verifying funding on-chain…");
          const recovered = await recoverAcceptanceFundingProgress(
            current.intentId,
          );
          if (recovered.ok) {
            setIntent(recovered.intent);
            if (recovered.engagementId) {
              setFinalizedEngagementId(recovered.engagementId);
            }
            return;
          }
          const noEscrowYet = recovered.error.includes("No on-chain escrow");
          if (recovered.recoverable && !noEscrowYet) {
            throw new Error(recovered.error);
          }
          if (!noEscrowYet && !recovered.recoverable) {
            throw new Error(recovered.error);
          }
        }

        setActiveStep("Waiting for wallet approval (fund escrow)…");
        const fundTx = await sendFundEscrowTransaction(
          signer,
          acceptanceIntentToWalletTerms(current),
        );
        if (!fundTx.txHash) {
          throw new Error("Fund transaction did not return a hash.");
        }
        setActiveStep("Verifying funding on-chain…");
        let claimedEscrowId: string | undefined;
        try {
          claimedEscrowId = parseEscrowIdFromFundOutcome(
            normalizeTransactionOutcome(fundTx.outcome),
          );
        } catch {
          claimedEscrowId = undefined;
        }
        const verified = await reportAcceptanceFundTx(
          current.intentId,
          fundTx.txHash,
          claimedEscrowId,
          signedAccountId ?? undefined,
        );
        if (!verified.ok) {
          throw new Error(verified.error);
        }
        setIntent(verified.intent);
        setFinalizedEngagementId(verified.engagementId);
      } else {
        setActiveStep("Finalizing acceptance…");
        const recovered = await reconcileAcceptanceFinalization(
          current.intentId,
        );
        if (recovered.ok) {
          setFinalizedEngagementId(recovered.engagementId);
          setIntent(recovered.intent);
        }
      }
    },
    [
      getTransactionSigner,
      signedAccountId,
      walletMatchesLink,
      linkedRequesterNearAccountId,
    ],
  );

  const registerRequesterTokenStorage = useCallback(async () => {
    if (
      !intent?.tokenContractId ||
      !registrationPreflight ||
      registrationPreflight.ok ||
      !registrationPreflight.storageDepositYocto
    ) {
      return;
    }
    setError(null);
    setBusy(true);
    setActiveStep("Registering for token storage…");
    try {
      if (!signedAccountId) {
        throw new Error("Connect your linked NEAR wallet first.");
      }
      if (!walletMatchesLink) {
        throw new Error(
          `Connected wallet must be ${linkedRequesterNearAccountId}.`,
        );
      }
      const signer = await getTransactionSigner();
      const deposited = await sendNep141StorageDeposit(
        signer,
        nearConfig,
        intent.tokenContractId,
        BigInt(registrationPreflight.storageDepositYocto),
      );
      if (!deposited.ok) {
        throw new Error(deposited.error);
      }
      setRegistrationPreflight(null);
      const again = await checkAcceptanceFundingPreflight(intent.intentId);
      if (!again.ok) {
        throw new Error(again.error);
      }
      setActiveStep(null);
      await executeWalletFunding(intent);
    } catch (e) {
      setError(
        formatAcceptanceFundingError(
          e instanceof Error ? e.message : "Registration failed.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }, [
    intent,
    registrationPreflight,
    signedAccountId,
    walletMatchesLink,
    linkedRequesterNearAccountId,
    getTransactionSigner,
    nearConfig,
    executeWalletFunding,
  ]);

  const showProviderBlockedToast = useCallback((message?: string) => {
    setBlockToastMessage(message ?? PROVIDER_ACTIVE_ENGAGEMENT_TOAST);
    setBlockToastOpen(true);
    setModalOpen(false);
    setConfirmOpen(false);
    setError(null);
  }, []);

  const syncAcceptedSnapshot = useCallback(async (): Promise<boolean> => {
    const snap = await loadActiveAcceptanceFundingForResponse(
      requestId,
      responseId,
    );
    if (!snap.ok || snap.intent?.status !== "finalized") {
      return false;
    }
    setIntent(snap.intent);
    setFinalizedEngagementId(snap.intent.plannedEngagementId);
    setConfirmOpen(false);
    return true;
  }, [requestId, responseId]);

  const runFundingFlow = useCallback(
    async (options: { skipPrepare?: boolean; continueOnly?: boolean }) => {
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
          setActiveStep(null);
          setModalOpen(true);
          return;
        }

        const recoverOnly =
          options.continueOnly ||
          acceptanceFundingNeedsOnChainRecovery(current);

        if (recoverOnly) {
          setActiveStep("Verifying funding on-chain…");
          const recovered = await recoverAcceptanceFundingProgress(
            current.intentId,
          );
          if (!recovered.ok) {
            const nothingOnChainYet =
              !recovered.recoverable &&
              recovered.error.includes("No on-chain escrow");
            if (nothingOnChainYet) {
              await executeWalletFunding(current);
            } else {
              throw new Error(recovered.error);
            }
          } else {
            setIntent(recovered.intent);
            if (recovered.engagementId) {
              setFinalizedEngagementId(recovered.engagementId);
            }
          }
        } else {
          await executeWalletFunding(current);
        }
        setActiveStep(null);
        setModalOpen(true);
        const accepted = await syncAcceptedSnapshot();
        if (!accepted) {
          router.refresh();
        }
      } catch (e) {
        const raw =
          e instanceof Error ? e.message : "Acceptance funding failed.";
        if (isProviderActiveEngagementError(raw)) {
          showProviderBlockedToast(PROVIDER_ACTIVE_ENGAGEMENT_TOAST);
          setActiveStep(null);
          await refreshSnapshot();
          return;
        }
        setError(formatAcceptanceFundingError(raw));
        setActiveStep(null);
        setModalOpen(true);
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
      showProviderBlockedToast,
      syncAcceptedSnapshot,
    ],
  );

  const fundTxExplorer =
    intent?.fundTxHash != null
      ? explorerTransactionUrl(networkId, intent.fundTxHash)
      : intent?.createTxHash != null
        ? explorerTransactionUrl(networkId, intent.createTxHash)
        : null;

  const walletRequired = linkedRequesterNearAccountId == null;
  const blocked = anotherAcceptanceInProgress && !intent && phase === "idle";
  const duplicateBlocked = blocksDuplicateFundingAttempt(phase, busy);

  const closeModal = useCallback(() => {
    if (busy) return;
    const refreshAfterClose =
      phase === "succeeded" && Boolean(finalizedEngagementId);
    setModalOpen(false);
    setConfirmOpen(false);
    setError(null);
    if (refreshAfterClose) {
      router.refresh();
    }
  }, [busy, phase, finalizedEngagementId, router]);

  const openFundingModal = useCallback((options?: { confirm?: boolean }) => {
    setError(null);
    if (options?.confirm) {
      setConfirmOpen(true);
    }
    setModalOpen(true);
  }, []);

  const handleRetryAcceptance = useCallback(async () => {
    if (busy || runGuard.current) return;
    setError(null);
    setConfirmOpen(false);
    setModalOpen(true);

    let currentIntent = intent;
    if (!currentIntent) {
      const snap = await loadActiveAcceptanceFundingForResponse(
        requestId,
        responseId,
      );
      if (snap.ok && snap.intent) {
        currentIntent = snap.intent;
        setIntent(snap.intent);
      }
    }

    const resumeExisting = Boolean(
      currentIntent && canCancelAcceptanceFunding(currentIntent),
    );
    await runFundingFlow({
      skipPrepare: resumeExisting,
      continueOnly: false,
    });
  }, [busy, intent, requestId, responseId, runFundingFlow]);

  const handleCancelAcceptance = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await cancelAcceptanceFunding(requestId, responseId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setIntent(null);
      setConfirmOpen(false);
      setModalOpen(false);
      setActiveStep(null);
      resumeOpenGuard.current = false;
      router.refresh();
    } finally {
      setBusy(false);
    }
  }, [busy, requestId, responseId, router]);

  const handleAcceptClick = useCallback(async () => {
    if (acceptGateLoading || blocked || walletRequired) {
      return;
    }
    setAcceptGateLoading(true);
    try {
      const eligibility = await checkAcceptOfferEligibility(
        requestId,
        responseId,
      );
      if (!eligibility.ok) {
        if (eligibility.code === "provider_active_engagement") {
          showProviderBlockedToast(PROVIDER_ACTIVE_ENGAGEMENT_TOAST);
          return;
        }
        setError(eligibility.error);
        return;
      }
      openFundingModal({ confirm: true });
    } finally {
      setAcceptGateLoading(false);
    }
  }, [
    acceptGateLoading,
    blocked,
    walletRequired,
    requestId,
    responseId,
    showProviderBlockedToast,
    openFundingModal,
  ]);

  if (!hydrated) {
    return (
      <p className="text-xs text-stone-500 dark:text-stone-400">
        Loading acceptance status…
      </p>
    );
  }

  const acceptButtonClass =
    variant === "drawer"
      ? "primary w-fit shrink-0"
      : "btn-ink w-fit shrink-0 rounded-lg px-3 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-60";

  const modalTitle =
    phase === "succeeded"
      ? "Offer accepted"
      : phase === "confirm"
        ? "Review & fund escrow"
        : acceptanceFundingPhaseLabel(phase) || "Accept offer";

  const showInflightActions =
    shouldShowContinueFunding(phase, Boolean(intent)) && !modalOpen;
  const showInflightCancel = canCancelAcceptanceFunding(intent);

  return (
    <div
      className={
        showInflightActions && variant !== "drawer"
          ? "flex w-full min-w-0 shrink-0 flex-col gap-2"
          : "flex w-fit shrink-0 flex-col gap-2"
      }
    >
      <AppToast
        message={blockToastMessage}
        visible={blockToastOpen}
        onClose={() => setBlockToastOpen(false)}
        variant="error"
      />
      {phase === "succeeded" && finalizedEngagementId && !modalOpen && (
        <Link
          href={`/engagements/${finalizedEngagementId}`}
          className="accept-funding-success-inline"
        >
          <FigmaIcon name="check" size={16} />
          Accepted · open engagement
        </Link>
      )}

      {phase === "idle" && !finalizedEngagementId && (
        <>
          <button
            type="button"
            disabled={blocked || walletRequired || acceptGateLoading}
            onClick={() => void handleAcceptClick()}
            className={acceptButtonClass}
          >
            {acceptGateLoading ? (
              <>
                <span
                  className="mr-1 inline-block h-2 w-2 animate-pulse rounded-full bg-current"
                  aria-hidden
                />
                Checking…
              </>
            ) : (
              "Accept"
            )}
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

      {showInflightActions && (
        <div className="acceptance-inflight-actions">
          <div
            className={`acceptance-inflight-actions__row${showInflightCancel ? "" : " acceptance-inflight-actions__row--solo"}`}
          >
            {showInflightCancel ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleCancelAcceptance()}
                className="acceptance-inflight-actions__cancel"
              >
                Cancel
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => openFundingModal()}
              className="btn-ink acceptance-inflight-actions__continue"
            >
              Continue funding
              <FigmaIcon name="arrow" size={16} />
            </button>
          </div>
        </div>
      )}

      {canRetryAcceptanceFunding(phase) && !busy && !modalOpen && (
        <button
          type="button"
          onClick={() => void handleRetryAcceptance()}
          className="w-fit text-sm font-medium underline"
        >
          Try acceptance again
        </button>
      )}

      <Dialog
        open={modalOpen}
        onOpenChange={(open) => {
          if (open) {
            setModalOpen(true);
            return;
          }
          closeModal();
        }}
        disablePointerDismissal={busy}
      >
        <DialogContent
          unstyled
          showCloseButton={false}
          overlayClassName="overlay modal-overlay"
          className="create-modal !w-[min(520px,calc(100%-36px))]"
          aria-describedby="accept-funding-desc"
        >
          <DialogTitle className="sr-only">{modalTitle}</DialogTitle>
          <div className="modal-head">
            <div className="min-w-0">
              <h2 className="font-heading m-0 text-[22px] leading-tight text-[var(--ink)]">
                {modalTitle}
              </h2>
            </div>
            <DialogClose
              render={
                <button
                  type="button"
                  aria-label="Close"
                  disabled={busy}
                  className="disabled:opacity-40"
                />
              }
            >
              <FigmaIcon name="close" size={18} />
            </DialogClose>
          </div>

          {phase !== "succeeded" ? (
            <div className="accept-funding-summary">
              <div>
                <p className="accept-funding-summary__label">Escrow amount</p>
                <p className="accept-funding-summary__amount">
                  {offerAmountDisplay}{" "}
                  <span className="font-sans font-medium">{assetSymbol}</span>
                </p>
              </div>
              <p className="accept-funding-summary__provider">
                {providerDisplayName}
              </p>
            </div>
          ) : null}

          <DialogDescription id="accept-funding-desc" className="sr-only">
            Accept this response by funding escrow on NEAR. Verification happens
            on-chain before the offer is accepted.
          </DialogDescription>

          {showStatusBanner && phaseLabel ? (
            <StatusBanner phase={phase} busy={false} label={phaseLabel} />
          ) : null}

          <div className="accept-funding-body">
            {phase === "confirm" && (
              <>
                <p className="text-[13px] leading-relaxed text-[var(--ink)]">
                  Funding locks this amount in escrow. The offer stays pending
                  until the transaction is verified on-chain — not when you sign
                  in your wallet.
                </p>
                {walletRequired ? (
                  <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100">
                    Link your NEAR wallet under{" "}
                    <Link href="/account" className="font-medium underline">
                      Account
                    </Link>{" "}
                    before continuing.
                  </p>
                ) : null}
              </>
            )}

            {phase === "succeeded" && finalizedEngagementId ? (
              <div className="accept-funding-success" role="status">
                <div className="accept-funding-success__icon" aria-hidden>
                  <FigmaIcon name="check" size={22} />
                </div>
                <p className="accept-funding-success__lead">
                  Escrow is funded on-chain and this offer is accepted.
                </p>
                <p className="accept-funding-success__meta">
                  {offerAmountDisplay} {assetSymbol} with {providerDisplayName}
                </p>
                {fundTxExplorer ? (
                  <a
                    href={fundTxExplorer}
                    target="_blank"
                    rel="noreferrer"
                    className="accept-funding-success__tx"
                  >
                    View funding transaction
                  </a>
                ) : null}
              </div>
            ) : null}

            {shouldShowContinueFunding(phase, Boolean(intent)) && (
              <p className="mt-4 text-[13px] leading-relaxed text-[var(--ink)]">
                Escrow funding in progress. The offer is not accepted until
                verification completes.
              </p>
            )}

            {error && (
              <p
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200"
                role="alert"
              >
                {error}
              </p>
            )}

            {registrationPreflight &&
            !registrationPreflight.ok &&
            registrationPreflight.registrationActor === "requester" ? (
              <div className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-3 text-sm dark:border-stone-700 dark:bg-stone-900/50">
                <p className="text-[var(--ink)]">
                  One-time {assetSymbol} registration requires a small NEAR
                  storage deposit in your wallet (not {assetSymbol}).
                </p>
                <button
                  type="button"
                  className="btn-ink mt-3 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
                  disabled={busy || walletRequired}
                  onClick={() => void registerRequesterTokenStorage()}
                >
                  {busy ? "Registering…" : `Register for ${assetSymbol}`}
                </button>
              </div>
            ) : null}

            {fundTxExplorer && phase !== "succeeded" ? (
              <a
                href={fundTxExplorer}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-medium text-[var(--deep)] underline"
              >
                View on-chain transaction
              </a>
            ) : null}
          </div>

          <div className="modal-actions">
            {phase === "confirm" && (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={closeModal}
                  className="secondary"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={busy || walletRequired}
                  onClick={() => void runFundingFlow({ skipPrepare: false })}
                  className="primary"
                >
                  Confirm & fund
                  <FigmaIcon name="arrow" size={17} />
                </button>
              </>
            )}

            {phase === "succeeded" && finalizedEngagementId ? (
              <div className="acceptance-inflight-actions acceptance-inflight-actions--modal">
                <div className="acceptance-inflight-actions__row">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="acceptance-inflight-actions__cancel"
                  >
                    Done
                  </button>
                  <Link
                    href={`/engagements/${finalizedEngagementId}`}
                    className="btn-ink acceptance-inflight-actions__continue"
                    onClick={() => {
                      setModalOpen(false);
                      router.refresh();
                    }}
                  >
                    Open engagement
                    <FigmaIcon name="arrow" size={17} />
                  </Link>
                </div>
              </div>
            ) : null}

            {shouldShowContinueFunding(phase, Boolean(intent)) && (
              <div className="acceptance-inflight-actions acceptance-inflight-actions--modal">
                {!signedAccountId && !walletRequired ? (
                  <button
                    type="button"
                    onClick={() => void connectWallet()}
                    className="secondary w-full max-w-full"
                  >
                    Connect wallet
                  </button>
                ) : null}
                {signedAccountId && !walletMatchesLink ? (
                  <p className="m-0 text-sm text-amber-800 dark:text-amber-200">
                    Connected as {signedAccountId}. Switch to{" "}
                    {linkedRequesterNearAccountId}.
                  </p>
                ) : null}
                <div
                  className={`acceptance-inflight-actions__row${showInflightCancel ? "" : " acceptance-inflight-actions__row--solo"}`}
                >
                  {showInflightCancel ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleCancelAcceptance()}
                      className="acceptance-inflight-actions__cancel"
                    >
                      Cancel
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={duplicateBlocked || walletRequired || busy}
                    onClick={() =>
                      void runFundingFlow({
                        skipPrepare: Boolean(intent),
                        continueOnly: Boolean(
                          intent &&
                            acceptanceFundingNeedsOnChainRecovery(intent),
                        ),
                      })
                    }
                    className="btn-ink acceptance-inflight-actions__continue"
                  >
                    {busy ? (activeStep ?? "Working…") : "Continue funding"}
                    {!busy && <FigmaIcon name="arrow" size={17} />}
                  </button>
                </div>
              </div>
            )}

            {canRetryAcceptanceFunding(phase) &&
              !busy &&
              phase !== "confirm" && (
                <>
                  <button
                    type="button"
                    onClick={closeModal}
                    className="secondary"
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleRetryAcceptance()}
                    className="primary"
                  >
                    Try again
                  </button>
                </>
              )}

            {busy &&
              phase !== "confirm" &&
              !shouldShowContinueFunding(phase, Boolean(intent)) && (
                <p className="flex w-full items-center gap-2 text-sm text-[var(--muted)]">
                  <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[var(--deep)]" />
                  {activeStep ?? "Working…"}
                </p>
              )}
          </div>
        </DialogContent>
      </Dialog>
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
