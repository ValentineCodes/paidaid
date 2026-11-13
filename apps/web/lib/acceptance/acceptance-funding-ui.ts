import type { AcceptanceFundingPrepareResult } from "./acceptance-funding-types";

export type AcceptanceFundingUiPhase =
  | "idle"
  | "confirm"
  | "preparing"
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
    case "awaiting_fund_wallet":
      return "Approve funding in your NEAR wallet";
    case "verifying_fund":
      return "Verifying funding on-chain…";
    case "fund_submitted":
      return "Funding transaction submitted";
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
    if (step.includes("verify")) return "verifying_fund";
    if (step.includes("fund") || step.includes("wallet")) {
      return "awaiting_fund_wallet";
    }
    return "preparing";
  }

  if (!intent) {
    return view.confirmOpen ? "confirm" : "idle";
  }

  switch (intent.status) {
    case "awaiting_wallet":
    case "fund_submitted":
    case "funding_verified":
    case "create_submitted":
      if (intent.fundTxHash) {
        return "fund_submitted";
      }
      if (intent.onChainEscrowId) {
        return "resume";
      }
      return "resume";
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
    phase === "awaiting_fund_wallet" ||
    phase === "verifying_fund" ||
    phase === "succeeded"
  );
}

const IN_FLIGHT_ACCEPTANCE_INTENT_STATUSES = [
  "awaiting_wallet",
  "create_submitted",
  "fund_submitted",
  "funding_verified",
] as const;

export function canCancelAcceptanceFunding(
  intent: AcceptanceFundingPrepareResult | null,
): boolean {
  if (!intent) return false;
  return (
    IN_FLIGHT_ACCEPTANCE_INTENT_STATUSES as readonly string[]
  ).includes(intent.status);
}

/** True when Continue should verify/sync chain state — not open the wallet for a new fund tx. */
export function acceptanceFundingNeedsOnChainRecovery(
  intent: AcceptanceFundingPrepareResult,
): boolean {
  if (intent.onChainEscrowId != null && intent.onChainEscrowId !== "") {
    return true;
  }
  if (intent.fundTxHash || intent.createTxHash) {
    return true;
  }
  return (
    intent.status === "fund_submitted" || intent.status === "funding_verified"
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
    canContinueAcceptanceFunding(phase) || phase === "fund_submitted"
  );
}
