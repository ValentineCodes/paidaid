"use server";

import {
  assertEscrowRecordMatchesFunding,
  assertEscrowReleasedOnChain,
  assertTransactionFinalSuccess,
  fetchTxFinalOutcome,
  TransactionExecutionFailedError,
  viewEscrowRecord,
  waitForEscrowReleaseSettlement,
  runNep141ReleasePreflight,
  type FundingVerificationExpectation,
  type Nep141PreflightCode,
} from "@paidaid/near";
import { normalizeDbNumericAmount, resolveAssetContractId } from "@paidaid/shared";
import { createClient } from "../../../lib/supabase/server";
import { createServiceClient } from "../../../lib/supabase/service";
import { escrowNearConfigForPayment } from "../../../lib/near/escrow-config";
import type { Database } from "../../../lib/database.types";
import type { EngagementSettlementView } from "../../../lib/engagement/settlement-types";

type PaymentRow = Database["public"]["Tables"]["engagement_escrow_payments"]["Row"];
type AssetRow = Database["public"]["Tables"]["assets"]["Row"];

function nearConfigForPayment(payment: PaymentRow) {
  return escrowNearConfigForPayment({
    escrow_contract_id: payment.escrow_contract_id,
    chain_id: payment.chain_id,
  });
}

export type SettlementActionResult =
  | { ok: true; settlement: EngagementSettlementView }
  | { ok: false; error: string };

function mapSettlementRow(
  row: {
    settlement_status: PaymentRow["settlement_status"];
    settlement_eligible_at: string | null;
    settlement_trigger: PaymentRow["settlement_trigger"];
    release_tx_hash: string | null;
    released_at: string | null;
    settlement_last_error: string | null;
    payment_funded: boolean;
    on_chain_escrow_id: number | null;
    requester_near_account_id: string;
    provider_near_account_id: string;
    escrow_contract_id: string;
    amount: number;
  },
): EngagementSettlementView {
  return {
    settlementStatus: row.settlement_status,
    settlementEligibleAt: row.settlement_eligible_at,
    settlementTrigger: row.settlement_trigger,
    releaseTxHash: row.release_tx_hash,
    releasedAt: row.released_at,
    settlementLastError: row.settlement_last_error,
    paymentFunded: row.payment_funded,
    onChainEscrowId:
      row.on_chain_escrow_id == null ? null : String(row.on_chain_escrow_id),
    requesterNearAccountId: row.requester_near_account_id,
    providerNearAccountId: row.provider_near_account_id,
    escrowContractId: row.escrow_contract_id,
    amountSmallestUnits: normalizeDbNumericAmount(row.amount),
  };
}

async function loadPaymentAsset(
  supabase: Awaited<ReturnType<typeof createClient>>,
  payment: PaymentRow,
): Promise<AssetRow | null> {
  const { data } = await supabase
    .from("assets")
    .select("*")
    .eq("id", payment.asset_id)
    .maybeSingle();
  return data;
}

function buildExpectation(
  payment: PaymentRow,
  asset: AssetRow,
): FundingVerificationExpectation {
  if (!payment.engagement_id) {
    throw new Error("Payment is not linked to an engagement.");
  }
  return {
    engagementId: payment.engagement_id,
    requesterNearAccountId: payment.requester_near_account_id,
    providerNearAccountId: payment.provider_near_account_id,
    amountSmallestUnits: normalizeDbNumericAmount(payment.amount),
    assetStandard: asset.asset_standard,
    ftContractId: asset.token_contract_id,
  };
}

async function applySettlementProgress(
  engagementId: string,
  status: PaymentRow["settlement_status"],
  fields: { releaseTxHash?: string | null; lastError?: string | null },
): Promise<void> {
  const service = createServiceClient();
  const { error } = await service.rpc("record_engagement_settlement_progress", {
    p_engagement_id: engagementId,
    p_status: status,
    p_release_tx_hash: fields.releaseTxHash ?? undefined,
    p_last_error: fields.lastError ?? undefined,
  });
  if (error) {
    throw new Error(error.message);
  }
}

async function finalizeEngagementAfterSettlement(
  engagementId: string,
  autoComplete: boolean,
): Promise<void> {
  const service = createServiceClient();
  const { data, error } = await service.rpc("complete_engagement_after_settlement", {
    p_engagement_id: engagementId,
    p_auto: autoComplete,
  });
  if (error) {
    throw new Error(error.message);
  }
  if (data !== true) {
    throw new Error("Could not complete engagement after settlement.");
  }
}

export type EngagementReleasePreflightResult =
  | { ok: true }
  | {
      ok: false;
      error: string;
      code?: Nep141PreflightCode;
      registrationActor?: "requester" | "provider";
      storageDepositYocto?: string;
      tokenContractId?: string | null;
      assetSymbol?: string;
    };

export async function checkEngagementReleasePreflight(
  engagementId: string,
): Promise<EngagementReleasePreflightResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Sign in required." };
  }

  const { data: payment, error: loadErr } = await supabase
    .from("engagement_escrow_payments")
    .select("*")
    .eq("engagement_id", engagementId)
    .maybeSingle();

  if (loadErr || !payment) {
    return { ok: false, error: loadErr?.message ?? "Escrow payment not found." };
  }

  const asset = await loadPaymentAsset(supabase, payment);
  if (!asset) {
    return { ok: false, error: "Asset metadata missing." };
  }

  const config = nearConfigForPayment(payment);
  const preflight = await runNep141ReleasePreflight(
    {
      config,
      assetStandard: asset.asset_standard,
      tokenContractId: asset.token_contract_id,
      registryTokenContractId: resolveAssetContractId({
        id: asset.id,
        chain_id: asset.chain_id,
        asset_standard: asset.asset_standard,
        native_reference: asset.native_reference,
        token_contract_id: asset.token_contract_id,
        symbol: asset.symbol,
        decimals: asset.decimals,
        canonical_asset_key: asset.canonical_asset_key,
        enabled: asset.enabled,
      }),
      symbol: asset.symbol,
      enabled: asset.enabled,
      providerNearAccountId: payment.provider_near_account_id,
      requesterNearAccountId: payment.requester_near_account_id,
    },
  );

  if (!preflight.ok) {
    return {
      ok: false,
      error: preflight.message,
      code: preflight.code,
      registrationActor: preflight.registrationActor,
      storageDepositYocto: preflight.storageDepositYocto,
      tokenContractId: asset.token_contract_id,
      assetSymbol: asset.symbol,
    };
  }

  return { ok: true };
}

export async function loadEngagementSettlementView(
  engagementId: string,
): Promise<SettlementActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Sign in required." };
  }

  const { data, error } = await supabase.rpc("get_engagement_settlement_status", {
    p_engagement_id: engagementId,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    return {
      ok: true,
      settlement: {
        settlementStatus: null,
        settlementEligibleAt: null,
        settlementTrigger: null,
        releaseTxHash: null,
        releasedAt: null,
        settlementLastError: null,
        paymentFunded: false,
        onChainEscrowId: null,
        requesterNearAccountId: null,
        providerNearAccountId: null,
        escrowContractId: null,
        amountSmallestUnits: null,
      },
    };
  }

  return { ok: true, settlement: mapSettlementRow(row) };
}

export async function reportEngagementReleaseTx(
  engagementId: string,
  txHash: string,
): Promise<SettlementActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Sign in required." };
  }

  const { data: payment, error: loadErr } = await supabase
    .from("engagement_escrow_payments")
    .select("*")
    .eq("engagement_id", engagementId)
    .maybeSingle();

  if (loadErr || !payment) {
    return { ok: false, error: loadErr?.message ?? "Escrow payment not found." };
  }
  if (payment.requester_user_id !== user.id) {
    return { ok: false, error: "Only the requester may release escrow." };
  }
  if (payment.status !== "funded" || payment.on_chain_escrow_id == null) {
    return { ok: false, error: "Escrow is not funded." };
  }

  if (payment.settlement_status === "released") {
    if (payment.release_tx_hash === txHash) {
      const view = await loadEngagementSettlementView(engagementId);
      if (view.ok) {
        return view;
      }
    }
    return { ok: false, error: "Engagement already settled." };
  }

  const allowedStatuses: PaymentRow["settlement_status"][] = [
    "eligible",
    "release_failed",
    "release_submitted",
  ];
  if (!allowedStatuses.includes(payment.settlement_status)) {
    return {
      ok: false,
      error: "Delivery must be approved before releasing payment.",
    };
  }

  const asset = await loadPaymentAsset(supabase, payment);
  if (!asset) {
    return { ok: false, error: "Asset metadata missing." };
  }

  const config = nearConfigForPayment(payment);
  const escrowId = String(payment.on_chain_escrow_id);
  const autoComplete = payment.settlement_trigger === "auto_complete";

  try {
    try {
      const rpcOutcome = await fetchTxFinalOutcome(
        config,
        txHash,
        payment.requester_near_account_id,
      );
      assertTransactionFinalSuccess(rpcOutcome);
    } catch (e) {
      if (e instanceof TransactionExecutionFailedError) {
        throw e;
      }
      // Hash may not be indexed yet; escrow release polling is authoritative below.
    }

    await applySettlementProgress(engagementId, "release_submitted", {
      releaseTxHash: txHash,
      lastError: null,
    });

    let record = await viewEscrowRecord(config, escrowId);
    if (record?.status === "Releasing" || record?.status === "Funded") {
      record = await waitForEscrowReleaseSettlement(config, escrowId);
    }
    if (!record || record.status !== "Released") {
      record = await waitForEscrowReleaseSettlement(config, escrowId);
    }

    const expectation = buildExpectation(payment, asset);
    assertEscrowRecordMatchesFunding(record, expectation);
    assertEscrowReleasedOnChain(record);

    await applySettlementProgress(engagementId, "released", {
      releaseTxHash: txHash,
      lastError: null,
    });

    await finalizeEngagementAfterSettlement(engagementId, autoComplete);

    return loadEngagementSettlementView(engagementId);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Release verification failed.";
    await applySettlementProgress(engagementId, "release_failed", {
      releaseTxHash: txHash,
      lastError: message,
    });
    return { ok: false, error: message };
  }
}
