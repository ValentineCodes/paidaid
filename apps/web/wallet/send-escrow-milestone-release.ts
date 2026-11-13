import { actionCreators } from "@near-js/transactions";
import { ESCROW_METHODS } from "@paidaid/shared";
import type { NearNetworkId } from "@paidaid/shared";
import { validateEscrowReleaseTerms } from "./escrow-transaction-validation";
import type { PaidAidNearTransactionSigner } from "./paidaid-near-transaction-signer";
import type { EscrowReleaseTxResult } from "./send-escrow-release";

const RELEASE_GAS = BigInt("300000000000000");

export async function sendReleaseMilestoneEscrowTransaction(
  signer: PaidAidNearTransactionSigner,
  escrowContractId: string,
  onChainEscrowId: string,
  milestoneIndex: number,
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

  if (milestoneIndex < 0 || milestoneIndex > 4) {
    throw new Error("Invalid milestone index");
  }

  const submission = await signer.signAndSendTransaction({
    receiverId: escrowContractId,
    actions: [
      actionCreators.functionCall(
        ESCROW_METHODS.releaseMilestone,
        { escrow_id: onChainEscrowId, milestone_index: milestoneIndex },
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
