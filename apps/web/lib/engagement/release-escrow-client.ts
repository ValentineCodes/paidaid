import type { Wallet } from "@near-wallet-selector/core";

import { sendReleaseEscrowTransaction } from "../../wallet/send-escrow-release";
import {
  loadEngagementSettlementView,
  reportEngagementReleaseTx,
} from "../../app/(main)/engagements/engagement-settlement-actions";
import type { EngagementSettlementView } from "./settlement-types";

export async function releaseEscrowForEngagement(
  engagementId: string,
  wallet: Wallet,
  settlement: Pick<
    EngagementSettlementView,
    "escrowContractId" | "onChainEscrowId"
  >,
): Promise<
  { ok: true; settlement: EngagementSettlementView } | { ok: false; error: string }
> {
  if (!settlement.onChainEscrowId || !settlement.escrowContractId) {
    return { ok: false, error: "Escrow metadata missing." };
  }

  const tx = await sendReleaseEscrowTransaction(
    wallet,
    settlement.escrowContractId,
    settlement.onChainEscrowId,
  );
  if (!tx.txHash) {
    return { ok: false, error: "Release transaction did not return a hash." };
  }

  const reported = await reportEngagementReleaseTx(engagementId, tx.txHash);
  if (!reported.ok) {
    return { ok: false, error: reported.error };
  }
  return { ok: true, settlement: reported.settlement };
}

export { loadEngagementSettlementView };
