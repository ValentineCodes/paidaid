import { sendReleaseMilestoneEscrowTransaction } from "../../wallet/send-escrow-milestone-release";
import type { PaidAidNearTransactionSigner } from "../../wallet/paidaid-near-transaction-signer";
import {
  loadMilestoneReleaseContext,
  reportMilestoneReleaseTx,
  type MilestoneReleaseContext,
} from "../../app/(main)/engagements/milestone-settlement-actions";

export async function releaseMilestoneForEngagement(
  milestoneId: string,
  signer: PaidAidNearTransactionSigner,
  context: Pick<
    MilestoneReleaseContext,
    | "escrowContractId"
    | "onChainEscrowId"
    | "milestoneIndex"
    | "requesterNearAccountId"
    | "chainId"
  >,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const tx = await sendReleaseMilestoneEscrowTransaction(
    signer,
    context.escrowContractId,
    context.onChainEscrowId,
    context.milestoneIndex,
    {
      requesterNearAccountId: context.requesterNearAccountId,
      chainId: context.chainId,
      appNetworkId: signer.appNetworkId,
    },
  );
  if (!tx.txHash) {
    return { ok: false, error: "Release transaction did not return a hash." };
  }

  const reported = await reportMilestoneReleaseTx(milestoneId, tx.txHash);
  if (!reported.ok) {
    return { ok: false, error: reported.error };
  }
  return { ok: true };
}

export { loadMilestoneReleaseContext };
