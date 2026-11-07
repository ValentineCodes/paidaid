import {
  assertFundingCompleteOnChain,
  assertEscrowReleasedOnChain,
  findEscrowIdForEngagementByScan,
  viewEscrowRecord,
  waitForEscrowReleaseSettlement,
  type FundingVerificationExpectation,
} from "@paidaid/near";
import { normalizeDbNumericAmount } from "@paidaid/shared";
import type { Database } from "../database.types";
import { readEscrowNearRuntimeConfig } from "../near/escrow-config";

type PaymentRow = Database["public"]["Tables"]["engagement_escrow_payments"]["Row"];
type AssetRow = Database["public"]["Tables"]["assets"]["Row"];

export type ReconcileOutcome =
  | { changed: false }
  | { changed: true; reason: string };

function buildExpectation(
  payment: PaymentRow,
  asset: AssetRow,
): FundingVerificationExpectation {
  return {
    engagementId: payment.engagement_id,
    requesterNearAccountId: payment.requester_near_account_id,
    providerNearAccountId: payment.provider_near_account_id,
    amountSmallestUnits: normalizeDbNumericAmount(payment.amount),
    assetStandard: asset.asset_standard,
    ftContractId: asset.token_contract_id,
  };
}

type ProgressFn = (
  engagementId: string,
  status: PaymentRow["status"],
  fields: {
    onChainEscrowId?: string | null;
    createTxHash?: string | null;
    fundTxHash?: string | null;
    lastError?: string | null;
  },
) => Promise<void>;

type SettlementFn = (
  engagementId: string,
  status: PaymentRow["settlement_status"],
  fields: { releaseTxHash?: string | null; lastError?: string | null },
) => Promise<void>;

export async function reconcileEngagementPaymentFromChain(
  payment: PaymentRow,
  asset: AssetRow,
  userId: string,
  deps: {
    applyFundingProgress: ProgressFn;
    applySettlementProgress: SettlementFn;
  },
): Promise<ReconcileOutcome> {
  const config = readEscrowNearRuntimeConfig();
  const expectation = buildExpectation(payment, asset);
  const isRequester = payment.requester_user_id === userId;
  if (payment.requester_user_id !== userId && payment.provider_user_id !== userId) {
    return { changed: false };
  }

  let escrowId =
    payment.on_chain_escrow_id != null
      ? String(payment.on_chain_escrow_id)
      : null;

  if (isRequester && payment.status !== "funded" && payment.status !== "failed") {
    if (!escrowId) {
      escrowId = await findEscrowIdForEngagementByScan(
        config,
        payment.engagement_id,
      );
      if (escrowId) {
        await deps.applyFundingProgress(payment.engagement_id, "create_submitted", {
          onChainEscrowId: escrowId,
          createTxHash: payment.create_tx_hash,
          lastError: null,
        });
        return { changed: true, reason: "linked on-chain escrow" };
      }
      return { changed: false };
    }

    const record = await viewEscrowRecord(config, escrowId);
    if (!record) {
      return { changed: false };
    }

    if (record.status === "Funded") {
      try {
        assertFundingCompleteOnChain(record, expectation);
        await deps.applyFundingProgress(payment.engagement_id, "funded", {
          fundTxHash: payment.fund_tx_hash,
          lastError: null,
        });
        return { changed: true, reason: "marked funded from chain" };
      } catch (e) {
        const message = e instanceof Error ? e.message : "Funding verify failed";
        await deps.applyFundingProgress(payment.engagement_id, "failed", {
          lastError: message,
        });
        return { changed: true, reason: message };
      }
    }
  }

  if (
    isRequester &&
    escrowId &&
    payment.status === "funded" &&
    payment.settlement_status === "release_submitted" &&
    payment.release_tx_hash
  ) {
    try {
      const record = await waitForEscrowReleaseSettlement(config, escrowId);
      assertEscrowReleasedOnChain(record);
      await deps.applySettlementProgress(payment.engagement_id, "released", {
        releaseTxHash: payment.release_tx_hash,
        lastError: null,
      });
      return { changed: true, reason: "release confirmed on-chain" };
    } catch (e) {
      const message = e instanceof Error ? e.message : "Release verify failed";
      await deps.applySettlementProgress(payment.engagement_id, "release_failed", {
        releaseTxHash: payment.release_tx_hash,
        lastError: message,
      });
      return { changed: true, reason: message };
    }
  }

  return { changed: false };
}
