import {
  ESCROW_FUND_FT_MSG_VERSION,
  normalizeNearAccountId,
} from "@paidaid/shared";
import type { EngagementFundingPrepareResult } from "../engagement/funding-types";

/** On-chain args for native `fund_escrow` (requester = transaction signer). */
export type EscrowFundCallArgs = {
  engagement_id: string;
  provider: string;
  amount: string;
};

export type EscrowFundMilestonesCallArgs = {
  engagement_id: string;
  provider: string;
  milestones: string[];
};

function baseFundArgs(terms: EngagementFundingPrepareResult) {
  return {
    engagement_id: terms.engagementId.trim(),
    provider: normalizeNearAccountId(terms.providerNearAccountId),
  };
}

/** Build fund args from server-prepared funding terms (never invent engagement ids client-side). */
export function buildEscrowFundCallArgs(
  terms: EngagementFundingPrepareResult,
): EscrowFundCallArgs {
  return {
    ...baseFundArgs(terms),
    amount: terms.amountSmallestUnits.trim(),
  };
}

export function buildEscrowFundMilestonesCallArgs(
  terms: EngagementFundingPrepareResult,
): EscrowFundMilestonesCallArgs {
  const milestones = terms.milestoneAmountsSmallest;
  if (!milestones?.length) {
    throw new Error("Missing milestone schedule for funding.");
  }
  return {
    ...baseFundArgs(terms),
    milestones: milestones.map((m) => m.trim()),
  };
}

export function fundingUsesMilestones(
  terms: EngagementFundingPrepareResult,
): boolean {
  return (terms.milestoneAmountsSmallest?.length ?? 0) > 0;
}

export function buildNep141FundEscrowTransferMessage(
  terms: EngagementFundingPrepareResult,
): string {
  const args = buildEscrowFundCallArgs(terms);
  const payload: Record<string, unknown> = {
    version: ESCROW_FUND_FT_MSG_VERSION,
    engagement_id: args.engagement_id,
    provider: args.provider,
  };
  if (fundingUsesMilestones(terms)) {
    payload.milestones = buildEscrowFundMilestonesCallArgs(terms).milestones;
  }
  return JSON.stringify(payload);
}
