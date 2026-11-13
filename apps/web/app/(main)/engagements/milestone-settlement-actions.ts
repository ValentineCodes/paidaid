"use server";

import {
  assertMilestoneReleaseOnChain,
  assertTransactionFinalSuccess,
  fetchTxFinalOutcome,
  TransactionExecutionFailedError,
  viewEscrowRecord,
  waitForMilestoneReleaseSettlement,
} from "@paidaid/near";
import { normalizeDbNumericAmount } from "@paidaid/shared";
import { createClient } from "../../../lib/supabase/server";
import { createServiceClient } from "../../../lib/supabase/service";
import { escrowNearConfigForPayment } from "../../../lib/near/escrow-config";
import type { Database } from "../../../lib/database.types";

type PaymentRow = Database["public"]["Tables"]["engagement_escrow_payments"]["Row"];

export type MilestoneReleaseContext = {
  milestoneId: string;
  engagementId: string;
  position: number;
  milestoneIndex: number;
  milestoneAmountSmallest: string;
  escrowContractId: string;
  onChainEscrowId: string;
  requesterNearAccountId: string;
  chainId: string;
  isFinalMilestone: boolean;
  priorMilestonesReleased: number;
  priorDepositedSmallest: string;
};

export type MilestoneReleaseContextResult =
  | { ok: true; context: MilestoneReleaseContext }
  | { ok: false; error: string };

export type MilestoneReleaseQueue = {
  onChainMilestonesReleased: number;
  /** Milestone that matches the next on-chain release slot (1-based position). */
  nextReleasePosition: number;
  releasableMilestoneId: string | null;
};

async function applyMilestoneSettlementProgress(
  milestoneId: string,
  status: Database["public"]["Enums"]["engagement_settlement_status"],
  fields: { releaseTxHash?: string | null; lastError?: string | null },
): Promise<void> {
  const service = createServiceClient();
  const { error } = await service.rpc("record_milestone_settlement_progress", {
    p_milestone_id: milestoneId,
    p_status: status,
    p_release_tx_hash: fields.releaseTxHash ?? undefined,
    p_last_error: fields.lastError ?? undefined,
  });
  if (error) {
    throw new Error(error.message);
  }
}

export async function loadMilestoneReleaseContext(
  milestoneId: string,
  options?: { mode?: "prepare" | "verify" },
): Promise<MilestoneReleaseContextResult> {
  const mode = options?.mode ?? "prepare";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Sign in required." };
  }

  const { data: milestone, error: mErr } = await supabase
    .from("engagement_milestones")
    .select(
      "id, engagement_id, position, amount, status, acceptance_intent_id",
    )
    .eq("id", milestoneId)
    .maybeSingle();

  if (mErr || !milestone?.engagement_id) {
    return { ok: false, error: mErr?.message ?? "Milestone not found." };
  }
  if (mode === "prepare") {
    if (milestone.status !== "release_eligible") {
      return { ok: false, error: "Milestone is not ready for payment release." };
    }
  } else if (
    milestone.status !== "release_eligible" &&
    milestone.status !== "release_submitted" &&
    milestone.status !== "released"
  ) {
    return { ok: false, error: "Milestone is not in payment release settlement." };
  }

  const { data: payment, error: payErr } = await supabase
    .from("engagement_escrow_payments")
    .select("*")
    .eq("engagement_id", milestone.engagement_id)
    .maybeSingle();

  if (payErr || !payment) {
    return { ok: false, error: payErr?.message ?? "Escrow payment not found." };
  }
  if (payment.requester_user_id !== user.id) {
    return { ok: false, error: "Only the requester may release milestone payment." };
  }
  if (payment.status !== "funded" || payment.on_chain_escrow_id == null) {
    return { ok: false, error: "Escrow is not funded." };
  }

  const { count } = await supabase
    .from("engagement_milestones")
    .select("id", { count: "exact", head: true })
    .eq("acceptance_intent_id", milestone.acceptance_intent_id);

  const total = count ?? 0;
  const isFinal = milestone.position >= total;

  const config = escrowNearConfigForPayment({
    escrow_contract_id: payment.escrow_contract_id,
    chain_id: payment.chain_id,
  });
  const escrowId = String(payment.on_chain_escrow_id);
  const record = await viewEscrowRecord(config, escrowId);
  if (!record) {
    return { ok: false, error: "On-chain escrow not found." };
  }

  const priorReleased = record.milestones_released ?? 0;
  const milestoneIndex = milestone.position - 1;

  if (mode === "prepare") {
    if (priorReleased !== milestoneIndex) {
      if (priorReleased < milestoneIndex) {
        return {
          ok: false,
          error: `Release milestone ${priorReleased + 1} on-chain before milestone ${milestone.position}.`,
        };
      }
      return {
        ok: false,
        error:
          "This milestone may already be released on-chain. Refresh the page and try the next step.",
      };
    }
  } else {
    if (priorReleased < milestoneIndex) {
      return {
        ok: false,
        error: `Release milestone ${priorReleased + 1} on-chain before milestone ${milestone.position}.`,
      };
    }
    if (priorReleased > milestoneIndex + 1) {
      return {
        ok: false,
        error:
          "This milestone may already be released on-chain. Refresh the page and try the next step.",
      };
    }
  }

  const priorMilestonesReleased =
    mode === "verify" ? milestoneIndex : priorReleased;

  return {
    ok: true,
    context: {
      milestoneId: milestone.id,
      engagementId: milestone.engagement_id,
      position: milestone.position,
      milestoneIndex,
      milestoneAmountSmallest: normalizeDbNumericAmount(milestone.amount),
      escrowContractId: payment.escrow_contract_id,
      onChainEscrowId: escrowId,
      requesterNearAccountId: payment.requester_near_account_id,
      chainId: payment.chain_id,
      isFinalMilestone: isFinal,
      priorMilestonesReleased,
      priorDepositedSmallest: normalizeDbNumericAmount(record.deposited),
    },
  };
}

/**
 * Reads on-chain release cursor, reconciles DB when the chain is ahead, returns the
 * single milestone that may call `release_milestone` next.
 */
export async function loadMilestoneReleaseQueue(
  engagementId: string,
): Promise<MilestoneReleaseQueue | null> {
  const supabase = await createClient();

  const { data: payment } = await supabase
    .from("engagement_escrow_payments")
    .select("status, on_chain_escrow_id, escrow_contract_id, chain_id")
    .eq("engagement_id", engagementId)
    .maybeSingle();

  if (
    !payment ||
    payment.status !== "funded" ||
    payment.on_chain_escrow_id == null
  ) {
    return null;
  }

  const config = escrowNearConfigForPayment({
    escrow_contract_id: payment.escrow_contract_id,
    chain_id: payment.chain_id,
  });
  let record;
  try {
    record = await viewEscrowRecord(config, String(payment.on_chain_escrow_id));
  } catch {
    return null;
  }
  if (!record) {
    return null;
  }

  const onChainReleased = record.milestones_released ?? 0;
  const nextReleasePosition = onChainReleased + 1;

  const { data: milestones } = await supabase
    .from("engagement_milestones")
    .select("id, position, status")
    .eq("engagement_id", engagementId)
    .order("position");

  if (!milestones?.length) {
    return null;
  }

  const service = createServiceClient();
  for (const m of milestones) {
    if (m.position > onChainReleased) {
      break;
    }
    if (m.status === "released") {
      continue;
    }
    if (
      m.status === "release_eligible" ||
      m.status === "release_submitted"
    ) {
      try {
        await service.rpc("record_milestone_settlement_progress", {
          p_milestone_id: m.id,
          p_status: "released",
        });
      } catch {
        // keep queue accurate; release click may still reconcile
      }
    }
  }

  const { data: fresh } = await supabase
    .from("engagement_milestones")
    .select("id, position, status")
    .eq("engagement_id", engagementId)
    .order("position");

  const releasable =
    fresh?.find(
      (m) =>
        m.position === nextReleasePosition &&
        (m.status === "release_eligible" ||
          m.status === "release_submitted"),
    ) ?? null;

  return {
    onChainMilestonesReleased: onChainReleased,
    nextReleasePosition,
    releasableMilestoneId: releasable?.id ?? null,
  };
}

export async function reportMilestoneReleaseTx(
  milestoneId: string,
  txHash: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Sign in required." };
  }

  const ctx = await loadMilestoneReleaseContext(milestoneId, { mode: "verify" });
  if (!ctx.ok) {
    return { ok: false, error: ctx.error };
  }
  const { context } = ctx;

  const { data: releaseRow } = await supabase
    .from("engagement_milestone_releases")
    .select("settlement_status, release_tx_hash")
    .eq("milestone_id", milestoneId)
    .maybeSingle();

  if (
    releaseRow?.settlement_status === "released" &&
    releaseRow.release_tx_hash === txHash
  ) {
    return { ok: true };
  }

  const config = escrowNearConfigForPayment({
    escrow_contract_id: context.escrowContractId,
    chain_id: context.chainId,
  });

  const chainNow = await viewEscrowRecord(config, context.onChainEscrowId);
  const onChainReleasedNow = chainNow?.milestones_released ?? 0;
  if (onChainReleasedNow === context.milestoneIndex + 1) {
    await applyMilestoneSettlementProgress(milestoneId, "released", {
      releaseTxHash: txHash,
      lastError: null,
    });
    return { ok: true };
  }

  try {
    try {
      const rpcOutcome = await fetchTxFinalOutcome(
        config,
        txHash,
        context.requesterNearAccountId,
      );
      assertTransactionFinalSuccess(rpcOutcome);
    } catch (e) {
      if (e instanceof TransactionExecutionFailedError) {
        throw e;
      }
    }

    await applyMilestoneSettlementProgress(milestoneId, "release_submitted", {
      releaseTxHash: txHash,
      lastError: null,
    });

    const record = await waitForMilestoneReleaseSettlement(
      config,
      context.onChainEscrowId,
      context.priorMilestonesReleased,
    );

    assertMilestoneReleaseOnChain(record, {
      milestoneIndex: context.milestoneIndex,
      milestoneAmountSmallest: context.milestoneAmountSmallest,
      priorMilestonesReleased: context.priorMilestonesReleased,
      priorDepositedSmallest: context.priorDepositedSmallest,
      isFinalMilestone: context.isFinalMilestone,
    });

    await applyMilestoneSettlementProgress(milestoneId, "released", {
      releaseTxHash: txHash,
      lastError: null,
    });

    return { ok: true };
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Milestone release verification failed.";
    try {
      await applyMilestoneSettlementProgress(milestoneId, "release_failed", {
        releaseTxHash: txHash,
        lastError: message,
      });
    } catch {
      // preserve root error
    }
    return { ok: false, error: message };
  }
}
