import { actionCreators } from "@near-js/transactions";
import { ESCROW_METHODS, smallestUnitsStringToBigInt } from "@paidaid/shared";
import type { EngagementFundingPrepareResult } from "../lib/engagement/funding-types";
import {
  buildEscrowFundCallArgs,
  buildEscrowFundMilestonesCallArgs,
  buildNep141FundEscrowTransferMessage,
  fundingUsesMilestones,
} from "../lib/near/escrow-fund-call";
import { validateEscrowFundTerms } from "./escrow-transaction-validation";
import type { PaidAidNearTransactionSigner } from "./paidaid-near-transaction-signer";

const ESCROW_GAS = BigInt("300000000000000");
const FT_TRANSFER_GAS = BigInt("300000000000000");

export type EscrowTxResult = {
  txHash: string | null;
  outcome: unknown;
};

/** Single-transaction native fund (create record + lock NEAR). */
export async function sendNativeFundEscrowTransaction(
  signer: PaidAidNearTransactionSigner,
  terms: EngagementFundingPrepareResult,
): Promise<EscrowTxResult> {
  validateEscrowFundTerms(signer, terms);
  const deposit = smallestUnitsStringToBigInt(terms.amountSmallestUnits);
  const args = buildEscrowFundCallArgs(terms);

  const submission = await signer.signAndSendTransaction({
    receiverId: terms.escrowContractId,
    actions: [
      actionCreators.functionCall(
        ESCROW_METHODS.fundEscrow,
        args,
        ESCROW_GAS,
        deposit,
      ),
    ],
  });

  return {
    outcome: submission.outcome,
    txHash: submission.txHash,
  };
}

export async function sendNativeFundEscrowMilestonesTransaction(
  signer: PaidAidNearTransactionSigner,
  terms: EngagementFundingPrepareResult,
): Promise<EscrowTxResult> {
  validateEscrowFundTerms(signer, terms);
  const deposit = smallestUnitsStringToBigInt(terms.amountSmallestUnits);
  const args = buildEscrowFundMilestonesCallArgs(terms);

  const submission = await signer.signAndSendTransaction({
    receiverId: terms.escrowContractId,
    actions: [
      actionCreators.functionCall(
        ESCROW_METHODS.fundEscrowMilestones,
        args,
        ESCROW_GAS,
        deposit,
      ),
    ],
  });

  return {
    outcome: submission.outcome,
    txHash: submission.txHash,
  };
}

/** Single-transaction NEP-141 fund via `ft_transfer_call` (record + tokens). */
export async function sendNep141FundEscrowTransaction(
  signer: PaidAidNearTransactionSigner,
  terms: EngagementFundingPrepareResult,
): Promise<EscrowTxResult> {
  validateEscrowFundTerms(signer, terms);
  if (!terms.tokenContractId) {
    throw new Error("Missing token contract for NEP-141 funding.");
  }

  const msg = buildNep141FundEscrowTransferMessage(terms);
  const amount = smallestUnitsStringToBigInt(terms.amountSmallestUnits);

  const submission = await signer.signAndSendTransaction({
    receiverId: terms.tokenContractId,
    actions: [
      actionCreators.functionCall(
        "ft_transfer_call",
        {
          receiver_id: terms.escrowContractId,
          amount: amount.toString(),
          msg,
        },
        FT_TRANSFER_GAS,
        BigInt(1),
      ),
    ],
  });

  return {
    outcome: submission.outcome,
    txHash: submission.txHash,
  };
}

export async function sendFundEscrowTransaction(
  signer: PaidAidNearTransactionSigner,
  terms: EngagementFundingPrepareResult,
): Promise<EscrowTxResult> {
  const milestone = fundingUsesMilestones(terms);
  if (terms.assetStandard === "native") {
    return milestone
      ? sendNativeFundEscrowMilestonesTransaction(signer, terms)
      : sendNativeFundEscrowTransaction(signer, terms);
  }
  return sendNep141FundEscrowTransaction(signer, terms);
}
