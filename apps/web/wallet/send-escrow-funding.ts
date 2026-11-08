import type { Wallet } from "@near-wallet-selector/core";
import { actionCreators } from "@near-js/transactions";
import { ESCROW_METHODS, smallestUnitsStringToBigInt } from "@paidaid/shared";
import type { EngagementFundingPrepareResult } from "../lib/engagement/funding-types";
import {
  buildEscrowFundCallArgs,
  buildNep141FundEscrowTransferMessage,
} from "../lib/near/escrow-fund-call";
import { extractTransactionHash } from "@paidaid/near";

const ESCROW_GAS = BigInt("300000000000000");
const FT_TRANSFER_GAS = BigInt("300000000000000");

export type EscrowTxResult = {
  txHash: string | null;
  outcome: unknown;
};

/** Single-transaction native fund (create record + lock NEAR). */
export async function sendNativeFundEscrowTransaction(
  wallet: Wallet,
  terms: EngagementFundingPrepareResult,
): Promise<EscrowTxResult> {
  const deposit = smallestUnitsStringToBigInt(terms.amountSmallestUnits);
  const args = buildEscrowFundCallArgs(terms);

  const outcome = await wallet.signAndSendTransaction({
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
    outcome,
    txHash: extractTransactionHash(outcome),
  };
}

/** Single-transaction NEP-141 fund via `ft_transfer_call` (record + tokens). */
export async function sendNep141FundEscrowTransaction(
  wallet: Wallet,
  terms: EngagementFundingPrepareResult,
): Promise<EscrowTxResult> {
  if (!terms.tokenContractId) {
    throw new Error("Missing token contract for NEP-141 funding.");
  }

  const msg = buildNep141FundEscrowTransferMessage(terms);
  const amount = smallestUnitsStringToBigInt(terms.amountSmallestUnits);

  const outcome = await wallet.signAndSendTransaction({
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
    outcome,
    txHash: extractTransactionHash(outcome),
  };
}

export async function sendFundEscrowTransaction(
  wallet: Wallet,
  terms: EngagementFundingPrepareResult,
): Promise<EscrowTxResult> {
  if (terms.assetStandard === "native") {
    return sendNativeFundEscrowTransaction(wallet, terms);
  }
  return sendNep141FundEscrowTransaction(wallet, terms);
}
