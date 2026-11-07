import type { AssetStandard } from "@paidaid/shared";
import type { Database } from "../database.types";

export type EngagementPaymentStatus =
  Database["public"]["Enums"]["engagement_payment_status"];

export type EngagementFundingPrepareResult = {
  paymentId: string;
  engagementId: string;
  escrowContractId: string;
  assetStandard: AssetStandard;
  tokenContractId: string | null;
  amountSmallestUnits: string;
  symbol: string;
  decimals: number;
  requesterNearAccountId: string;
  providerNearAccountId: string;
  onChainEscrowId: string | null;
  status: EngagementPaymentStatus;
  createTxHash: string | null;
  fundTxHash: string | null;
};
