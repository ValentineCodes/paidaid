import type { Database } from "../database.types";

export type PaymentEventKind =
  Database["public"]["Enums"]["engagement_payment_event_kind"];

export type PaymentEventStatus =
  Database["public"]["Enums"]["engagement_payment_event_status"];

export type PaymentActivityRow = {
  eventId: string;
  paymentId: string;
  engagementId: string;
  requestTitle: string;
  viewerRole: "requester" | "provider";
  kind: PaymentEventKind;
  status: PaymentEventStatus;
  amountSmallestUnits: string;
  assetSymbol: string;
  assetDecimals: number;
  chainId: string;
  txHash: string | null;
  occurredAt: string;
  confirmedAt: string | null;
  lastError: string | null;
};

export type PaymentActivitySummary = {
  totalFundedSmallestUnits: string;
  lockedInEscrowSmallestUnits: string;
  totalReceivedSmallestUnits: string;
  totalRefundedSmallestUnits: string;
  fundedCount: number;
  lockedCount: number;
  receivedCount: number;
  refundCount: number;
};

export type PaymentActivityFilter = {
  kind?: PaymentEventKind | null;
  status?: PaymentEventStatus | null;
};

export type PaymentActivityPageData = {
  summary: PaymentActivitySummary;
  items: PaymentActivityRow[];
  hasMore: boolean;
};
