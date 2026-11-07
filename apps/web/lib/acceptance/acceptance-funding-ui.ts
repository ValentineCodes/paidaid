import type { AcceptanceFundingPrepareResult } from "./acceptance-funding-types";

export type AcceptanceFundingUiPhase =
  | "idle"
  | "confirm"
  | "preparing"
  | "awaiting_wallet"
  | "create_submitted"
  | "verifying_create"
  | "awaiting_fund_wallet"
  | "fund_submitted"
  | "verifying_fund"
  | "succeeded"
  | "failed"
  | "wallet_rejected"
  | "pending_tx"
  | "expired"
  | "resume";

export type AcceptanceFundingViewState = {
  /** User opened the confirmation step but has not confirmed yet. */
  confirmOpen: boolean;
  busy: boolean;
  /** Active step label from the wallet / server flow. */
  activeStep: string | null;
  lastError: string | null;
  finalizedEngagementId: string | null;
};

export function acceptanceFundingPhaseLabel(
  phase: AcceptanceFundingUiPhase,
): string {
  switch (phase) {
    case "idle":
      return "";
    case "confirm":
      return "Review escrow funding";
    case "preparing":
      return "Preparing acceptance…";
    case "awaiting_wallet":
      return "Approve in your NEAR wallet";
    case "create_submitted":
      return "Escrow create submitted";
    case "verifying_create":
      return "Verifying escrow on-chain…";
    case "awaiting_fund_wallet":
      return "Approve funding in your wallet";
    case "fund_submitted":
      return "Funding transaction submitted";
    case "verifying_fund":
      return "Verifying funding on-chain…";
    case "succeeded":
      return "Offer accepted";
    case "failed":
      return "Funding failed";
    case "wallet_rejected":
      return "Wallet request cancelled";
    case "pending_tx":
      return "Transaction pending";
    case "expired":
      return "Authorization expired";
    case "resume":
      return "Continue funding";
    default:
      return "";
  }
}

export function deriveAcceptanceFundingUiPhase(
  intent: AcceptanceFundingPrepareResult | null,
  view: AcceptanceFundingViewState,
): AcceptanceFundingUiPhase {
  if (view.finalizedEngagementId || intent?.status === "finalized") {
    return "succeeded";
  }

  if (view.confirmOpen && !intent) {
    return "confirm";
  }

  const err = view.lastError?.toLowerCase() ?? "";
  if (view.lastError && !view.busy) {
    if (/cancel|rejected/i.test(err)) {
      return "wallet_rejected";
    }
    if (/expired/i.test(err)) {
      return "expired";
    }
    if (/pending|not final|not indexed/i.test(err)) {
      return "pending_tx";
    }
    if (intent?.status === "failed" || intent?.status === "expired") {
      return intent.status === "expired" ? "expired" : "failed";
    }
    return "failed";
  }

  if (view.busy) {
    const step = view.activeStep?.toLowerCase() ?? "";
    if (step.includes("prepar")) return "preparing";
    if (step.includes("verify") && step.includes("fund")) return "verifying_fund";
    if (step.includes("verify")) return "verifying_create";
    if (step.includes("fund")) return "awaiting_fund_wallet";
    if (step.includes("creat")) return "awaiting_wallet";
    return "preparing";
  }

  if (!intent) {
    return view.confirmOpen ? "confirm" : "idle";
  }

  switch (intent.status) {
    case "awaiting_wallet":
      if (intent.onChainEscrowId) {
        return "resume";
      }
      if (intent.createTxHash) {
        return "create_submitted";
      }
      return "resume";
    case "create_submitted":
      return intent.onChainEscrowId ? "resume" : "create_submitted";
    case "fund_submitted":
      return "fund_submitted";
    case "funding_verified":
      return "verifying_fund";
    case "failed":
      return "failed";
    case "expired":
      return "expired";
    default:
      return "resume";
  }
}

export function canContinueAcceptanceFunding(
  phase: AcceptanceFundingUiPhase,
): boolean {
  return (
    phase === "resume" ||
    phase === "create_submitted" ||
    phase === "fund_submitted" ||
    phase === "pending_tx" ||
    phase === "verifying_fund"
  );
}

export function canRetryAcceptanceFunding(
  phase: AcceptanceFundingUiPhase,
): boolean {
  return (
    phase === "failed" ||
    phase === "wallet_rejected" ||
    phase === "expired"
  );
}

export function blocksDuplicateFundingAttempt(
  phase: AcceptanceFundingUiPhase,
  busy: boolean,
): boolean {
  if (busy) return true;
  return (
    phase === "preparing" ||
    phase === "awaiting_wallet" ||
    phase === "verifying_create" ||
    phase === "awaiting_fund_wallet" ||
    phase === "verifying_fund"
  );
}

export function shouldShowContinueFunding(
  phase: AcceptanceFundingUiPhase,
  hasIntent: boolean,
): boolean {
  if (!hasIntent) return false;
  if (
    phase === "succeeded" ||
    phase === "confirm" ||
    phase === "idle" ||
    phase === "failed" ||
    phase === "expired" ||
    phase === "wallet_rejected"
  ) {
    return false;
  }
  return (
    canContinueAcceptanceFunding(phase) ||
    phase === "create_submitted" ||
    phase === "fund_submitted"
  );
}
