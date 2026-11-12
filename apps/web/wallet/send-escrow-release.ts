import { actionCreators } from "@near-js/transactions";
import { ESCROW_METHODS } from "@paidaid/shared";
import type { NearNetworkId } from "@paidaid/shared";
import { validateEscrowReleaseTerms } from "./escrow-transaction-validation";
import type { PaidAidNearTransactionSigner } from "./paidaid-near-transaction-signer";

const RELEASE_GAS = BigInt("300000000000000");

export type EscrowReleaseTxResult = {
  txHash: string | null;
  outcome: unknown;
};

export async function sendReleaseEscrowTransaction(
  signer: PaidAidNearTransactionSigner,
  escrowContractId: string,
  onChainEscrowId: string,
  options?: {
    chainId?: string | null;
    requesterNearAccountId?: string | null;
    appNetworkId?: NearNetworkId;
  },
): Promise<EscrowReleaseTxResult> {
  const appNetworkId = options?.appNetworkId ?? signer.appNetworkId;
  validateEscrowReleaseTerms({
    signer,
    escrowContractId,
    onChainEscrowId,
    chainId: options?.chainId,
    requesterNearAccountId: options?.requesterNearAccountId,
    appNetworkId,
  });

  const submission = await signer.signAndSendTransaction({
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
    outcome: submission.outcome,
    txHash: submission.txHash,
  };
}
