import type { AcceptanceFundingPrepareResult } from "./acceptance-funding-types";
import type { EngagementFundingPrepareResult } from "../engagement/funding-types";

export function acceptanceIntentToWalletTerms(
  intent: AcceptanceFundingPrepareResult,
): EngagementFundingPrepareResult {
  return {
    paymentId: intent.paymentId,
    engagementId: intent.plannedEngagementId,
    chainId: intent.chainId,
    escrowContractId: intent.escrowContractId,
    assetStandard: intent.assetStandard,
    tokenContractId: intent.tokenContractId,
    amountSmallestUnits: intent.amountSmallestUnits,
    symbol: intent.symbol,
    decimals: intent.decimals,
    requesterNearAccountId: intent.requesterNearAccountId,
    providerNearAccountId: intent.providerNearAccountId,
    onChainEscrowId: intent.onChainEscrowId,
    status:
      intent.status === "finalized" || intent.status === "funding_verified"
        ? "funded"
        : intent.status === "fund_submitted"
          ? "deposit_submitted"
          : "prepared",
    createTxHash: intent.createTxHash,
    fundTxHash: intent.fundTxHash,
  };
}
