import type { AssetStandard } from "@paidaid/shared";
import type { Database } from "../database.types";

export type AcceptanceFundingIntentStatus =
  Database["public"]["Enums"]["acceptance_funding_intent_status"];

export type AcceptanceFundingPrepareResult = {
  intentId: string;
  paymentId: string;
  requestId: string;
  responseId: string;
  plannedEngagementId: string;
  chainId: string;
  escrowContractId: string;
  assetStandard: AssetStandard;
  tokenContractId: string | null;
  amountSmallestUnits: string;
  symbol: string;
  decimals: number;
  requesterNearAccountId: string;
  providerNearAccountId: string;
  status: AcceptanceFundingIntentStatus;
  createTxHash: string | null;
  fundTxHash: string | null;
  onChainEscrowId: string | null;
};
