import type { Wallet } from "@near-wallet-selector/core";
import { actionCreators } from "@near-js/transactions";
import {
  ESCROW_METHODS,
  smallestUnitsStringToBigInt,
} from "@paidaid/shared";
import type { EngagementFundingPrepareResult } from "../lib/engagement/funding-types";
import { extractTransactionHash } from "@paidaid/near";

const ESCROW_GAS = BigInt("300000000000000");
const FT_TRANSFER_GAS = BigInt("300000000000000");

export type EscrowTxResult = {
  txHash: string | null;
  outcome: unknown;
};

export async function sendCreateEscrowTransaction(
  wallet: Wallet,
  terms: EngagementFundingPrepareResult,
): Promise<EscrowTxResult> {
  const asset =
    terms.assetStandard === "native" ? "Native" : "Nep141";

  const outcome = await wallet.signAndSendTransaction({
    receiverId: terms.escrowContractId,
    actions: [
      actionCreators.functionCall(
        ESCROW_METHODS.createEscrow,
        {
          engagement_id: terms.engagementId,
          provider: terms.providerNearAccountId,
          asset,
          ft_contract: terms.tokenContractId,
          amount: terms.amountSmallestUnits,
        },
        ESCROW_GAS,
        BigInt(0),
      ),
    ],
  });

  return {
    outcome,
    txHash: extractTransactionHash(outcome),
  };
}

export async function sendDepositNativeEscrowTransaction(
  wallet: Wallet,
  terms: EngagementFundingPrepareResult,
  onChainEscrowId: string,
): Promise<EscrowTxResult> {
  const deposit = smallestUnitsStringToBigInt(terms.amountSmallestUnits);

  const outcome = await wallet.signAndSendTransaction({
    receiverId: terms.escrowContractId,
    actions: [
      actionCreators.functionCall(
        ESCROW_METHODS.depositNative,
        { escrow_id: onChainEscrowId },
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

export async function sendNep141EscrowFundingTransaction(
  wallet: Wallet,
  terms: EngagementFundingPrepareResult,
  onChainEscrowId: string,
): Promise<EscrowTxResult> {
  if (!terms.tokenContractId) {
    throw new Error("Missing token contract for NEP-141 funding.");
  }

  const msg = JSON.stringify({ escrow_id: Number(onChainEscrowId) });
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
  onChainEscrowId: string,
): Promise<EscrowTxResult> {
  if (terms.assetStandard === "native") {
    return sendDepositNativeEscrowTransaction(wallet, terms, onChainEscrowId);
  }
  return sendNep141EscrowFundingTransaction(wallet, terms, onChainEscrowId);
}
