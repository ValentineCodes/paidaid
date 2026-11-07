import type { Wallet } from "@near-wallet-selector/core";
import { actionCreators } from "@near-js/transactions";
import { ESCROW_METHODS } from "@paidaid/shared";
import { extractTransactionHash } from "@paidaid/near";

const RELEASE_GAS = BigInt("300000000000000");

export type EscrowReleaseTxResult = {
  txHash: string | null;
  outcome: unknown;
};

export async function sendReleaseEscrowTransaction(
  wallet: Wallet,
  escrowContractId: string,
  onChainEscrowId: string,
): Promise<EscrowReleaseTxResult> {
  const outcome = await wallet.signAndSendTransaction({
    receiverId: escrowContractId,
    actions: [
      actionCreators.functionCall(
        ESCROW_METHODS.release,
        { escrow_id: onChainEscrowId },
        RELEASE_GAS,
        BigInt(0),
      ),
    ],
  });

  return {
    outcome,
    txHash: extractTransactionHash(outcome),
  };
}
