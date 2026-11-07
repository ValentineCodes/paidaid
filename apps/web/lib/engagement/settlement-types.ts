import type { Database } from "../database.types";

export type EngagementSettlementStatus =
  Database["public"]["Enums"]["engagement_settlement_status"];

export type EngagementSettlementTrigger =
  Database["public"]["Enums"]["engagement_settlement_trigger"];

export type EngagementSettlementView = {
  settlementStatus: EngagementSettlementStatus | null;
  settlementEligibleAt: string | null;
  settlementTrigger: EngagementSettlementTrigger | null;
  releaseTxHash: string | null;
  releasedAt: string | null;
  settlementLastError: string | null;
  paymentFunded: boolean;
  onChainEscrowId: string | null;
  requesterNearAccountId: string | null;
  providerNearAccountId: string | null;
  escrowContractId: string | null;
  amountSmallestUnits: string | null;
};
