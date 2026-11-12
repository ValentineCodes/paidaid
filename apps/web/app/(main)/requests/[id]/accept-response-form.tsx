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
import { FigmaIcon } from "../../../../components/figma-icons";
import { useWalletSelector } from "@near-wallet-selector/react-hook";
import { parseNearNetworkId } from "@paidaid/shared";
import {
  explorerTransactionUrl,
  normalizeTransactionOutcome,
  parseEscrowIdFromFundOutcome,
} from "@paidaid/near";

import { NearSessionProvider } from "../../../../wallet/near-session-provider";
import { useNearWalletAccountId } from "../../../../wallet/use-near-wallet-account";
import { formatWalletConnectionError } from "../../../../wallet/errors";
import {
  signInWithIntearWallet,
  assertIntearWalletModule,
} from "../../../../wallet/connect-intear";
import { readWalletContractId } from "../../../../wallet/config";
import { sendFundEscrowTransaction } from "../../../../wallet/send-escrow-funding";
import {
  checkAcceptanceFundingBalance,
  prepareAcceptanceFunding,
  recoverAcceptanceFundingProgress,
  reportAcceptanceFundTx,
  reconcileAcceptanceFinalization,
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
  const { walletSelector } = useWalletSelector();
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
          wallet,
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
      walletSelector,
      signedAccountId,
      walletMatchesLink,
      linkedRequesterNearAccountId,
    ],
  );

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
          router.refresh();
          return;
        }

        if (options.continueOnly) {
          setActiveStep("Verifying funding on-chain…");
          const recovered = await recoverAcceptanceFundingProgress(
            current.intentId,
          );
          if (!recovered.ok) {
            if (
              !recovered.recoverable &&
              recovered.error.includes("No on-chain escrow")
            ) {
              throw new Error(
                "No fund transaction yet. Confirm funding in your wallet first, then use Continue.",
              );
            }
            throw new Error(recovered.error);
          }
          setIntent(recovered.intent);
          if (recovered.engagementId) {
            setFinalizedEngagementId(recovered.engagementId);
          }
        } else {
          await executeWalletFunding(current);
        }
        setActiveStep(null);
        setModalOpen(true);
        router.refresh();
      } catch (e) {
        const raw =
          e instanceof Error ? e.message : "Acceptance funding failed.";
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
    setModalOpen(false);
    setConfirmOpen(false);
    setError(null);
  }, [busy]);

  const openFundingModal = useCallback((options?: { confirm?: boolean }) => {
    setError(null);
    if (options?.confirm) {
      setConfirmOpen(true);
    }
    setModalOpen(true);
  }, []);

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

  return (
    <div className="flex w-fit shrink-0 flex-col gap-2">
      {phase === "succeeded" && finalizedEngagementId && !modalOpen && (
        <Link
          href={`/engagements/${finalizedEngagementId}`}
          className="text-sm font-medium text-emerald-800 underline dark:text-emerald-200"
        >
          Accepted · open engagement
        </Link>
      )}

      {phase === "idle" && !finalizedEngagementId && (
        <>
          <button
            type="button"
            disabled={blocked || walletRequired}
            onClick={() => openFundingModal({ confirm: true })}
            className={acceptButtonClass}
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

      {shouldShowContinueFunding(phase, Boolean(intent)) && !modalOpen && (
        <button
          type="button"
          onClick={() => openFundingModal()}
          className="secondary w-fit shrink-0 text-sm"
        >
          Continue funding
        </button>
      )}

      {canRetryAcceptanceFunding(phase) && !busy && !modalOpen && (
        <button
          type="button"
          onClick={() => {
            setIntent(null);
            openFundingModal({ confirm: true });
          }}
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
              <p className="mt-1 text-[13px] text-[var(--muted)]">
                {providerDisplayName} · NEAR {networkId}
              </p>
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

          <DialogDescription id="accept-funding-desc" className="sr-only">
            Accept this response by funding escrow on NEAR. Verification happens
            on-chain before the offer is accepted.
          </DialogDescription>

          {phase !== "idle" && phase !== "confirm" && (phaseLabel || busy) && (
            <StatusBanner phase={phase} busy={busy} label={phaseLabel ?? ""} />
          )}

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
                ) : (
                  <p className="text-xs text-[var(--muted)]">
                    Funding wallet:{" "}
                    <span className="font-mono">
                      {linkedRequesterNearAccountId}
                    </span>
                  </p>
                )}
              </>
            )}

            {phase === "succeeded" && finalizedEngagementId && (
              <p className="text-sm text-emerald-800 dark:text-emerald-200">
                Escrow is funded on {networkId}. You can message and coordinate
                from the engagement page.
              </p>
            )}

            {shouldShowContinueFunding(phase, Boolean(intent)) && (
              <p className="text-[13px] leading-relaxed text-[var(--ink)]">
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

            {fundTxExplorer && (
              <a
                href={fundTxExplorer}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-medium text-[var(--deep)] underline"
              >
                View on-chain transaction
              </a>
            )}
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

            {phase === "succeeded" && finalizedEngagementId && (
              <>
                <button
                  type="button"
                  onClick={closeModal}
                  className="secondary"
                >
                  Done
                </button>
                <Link
                  href={`/engagements/${finalizedEngagementId}`}
                  className="primary"
                  onClick={() => setModalOpen(false)}
                >
                  Open engagement
                  <FigmaIcon name="arrow" size={17} />
                </Link>
              </>
            )}

            {shouldShowContinueFunding(phase, Boolean(intent)) && (
              <>
                {!signedAccountId && !walletRequired && (
                  <button
                    type="button"
                    onClick={() => void connectWallet()}
                    className="secondary"
                  >
                    Connect wallet
                  </button>
                )}
                {signedAccountId && !walletMatchesLink && (
                  <p className="w-full text-sm text-amber-800 dark:text-amber-200">
                    Connected as {signedAccountId}. Switch to{" "}
                    {linkedRequesterNearAccountId}.
                  </p>
                )}
                <button
                  type="button"
                  disabled={duplicateBlocked || walletRequired || busy}
                  onClick={() =>
                    void runFundingFlow({
                      skipPrepare: Boolean(intent),
                      continueOnly:
                        phase === "resume" ||
                        phase === "fund_submitted" ||
                        phase === "pending_tx",
                    })
                  }
                  className="primary"
                >
                  {busy ? (activeStep ?? "Working…") : "Continue"}
                  {!busy && <FigmaIcon name="arrow" size={17} />}
                </button>
              </>
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
                    onClick={() => {
                      setIntent(null);
                      setConfirmOpen(true);
                    }}
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
