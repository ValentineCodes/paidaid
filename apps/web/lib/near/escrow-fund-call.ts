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

/** Build fund args from server-prepared funding terms (never invent engagement ids client-side). */
export function buildEscrowFundCallArgs(
  terms: EngagementFundingPrepareResult,
): EscrowFundCallArgs {
  return {
    engagement_id: terms.engagementId.trim(),
    provider: normalizeNearAccountId(terms.providerNearAccountId),
    amount: terms.amountSmallestUnits.trim(),
  };
}

export function buildNep141FundEscrowTransferMessage(
  terms: EngagementFundingPrepareResult,
): string {
  const args = buildEscrowFundCallArgs(terms);
  return JSON.stringify({
    version: ESCROW_FUND_FT_MSG_VERSION,
    engagement_id: args.engagement_id,
    provider: args.provider,
  });
}
