import {
  ESCROW_METHODS,
  assertAssetChainMatchesNetwork,
  assertSameNearNetwork,
  networkFromChainId,
  normalizeNearAccountId,
  type NearNetworkId,
} from "@paidaid/shared";
import type { EngagementFundingPrepareResult } from "../lib/engagement/funding-types";
import { buildEscrowFundCallArgs } from "../lib/near/escrow-fund-call";
import type { PaidAidNearTransactionSigner } from "./paidaid-near-transaction-signer";

export function validateEscrowFundTerms(
  signer: Pick<PaidAidNearTransactionSigner, "accountId" | "appNetworkId">,
  terms: EngagementFundingPrepareResult,
): void {
  assertAssetChainMatchesNetwork(terms.chainId, signer.appNetworkId);
  assertSameNearNetwork(
    signer.appNetworkId,
    networkFromChainId(terms.chainId),
    "Escrow funding",
  );

  const requester = normalizeNearAccountId(terms.requesterNearAccountId);
  const connected = normalizeNearAccountId(signer.accountId);
  if (requester !== connected) {
    throw new Error(
      `Connected wallet must be ${requester} to fund this escrow.`,
    );
  }

  if (!terms.escrowContractId?.trim()) {
    throw new Error("Escrow contract id is missing.");
  }
  if (!terms.engagementId?.trim()) {
    throw new Error("Engagement id is missing.");
  }
  if (!terms.amountSmallestUnits?.trim()) {
    throw new Error("Funding amount is missing.");
  }

  const args = buildEscrowFundCallArgs(terms);
  if (args.engagement_id !== terms.engagementId.trim()) {
    throw new Error("Escrow fund args do not match engagement id.");
  }
}

export function validateEscrowReleaseTerms(input: {
  signer: Pick<PaidAidNearTransactionSigner, "accountId" | "appNetworkId">;
  escrowContractId: string;
  onChainEscrowId: string;
  chainId?: string | null;
  requesterNearAccountId?: string | null;
  appNetworkId: NearNetworkId;
}): void {
  if (input.chainId) {
    assertAssetChainMatchesNetwork(input.chainId, input.appNetworkId);
  }
  assertSameNearNetwork(input.signer.appNetworkId, input.appNetworkId, "Escrow release");

  if (input.requesterNearAccountId) {
    const requester = normalizeNearAccountId(input.requesterNearAccountId);
    const connected = normalizeNearAccountId(input.signer.accountId);
    if (requester !== connected) {
      throw new Error(`Connected wallet must be ${requester} to release escrow.`);
    }
  }

  if (!input.escrowContractId?.trim()) {
    throw new Error("Escrow contract id is missing.");
  }
  if (!input.onChainEscrowId?.trim()) {
    throw new Error("On-chain escrow id is missing.");
  }
}

export const ESCROW_RELEASE_METHOD = ESCROW_METHODS.release;
