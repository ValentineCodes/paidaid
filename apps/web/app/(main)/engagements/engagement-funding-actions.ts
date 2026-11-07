"use server";

import {
  assertEscrowRecordMatchesFunding,
  assertFundingCompleteOnChain,
  assertTransactionFinalSuccess,
  fetchTxFinalOutcome,
  findEscrowIdForEngagementByScan,
  resolveEscrowIdAfterCreateTx,
  TransactionExecutionFailedError,
  viewEscrowRecord,
  type FundingVerificationExpectation,
} from "@paidaid/near";
import {
  bigintToSmallestUnitsString,
  normalizeDbNumericAmount,
  resolveAssetContractId,
  smallestUnitsStringToBigInt,
  type AssetStandard,
} from "@paidaid/shared";
import { createClient } from "../../../lib/supabase/server";
import { createServiceClient } from "../../../lib/supabase/service";
import {
  chainIdForCurrentNearNetwork,
  escrowNearConfigForPayment,
  readEscrowNearRuntimeConfig,
} from "../../../lib/near/escrow-config";
import type { Database } from "../../../lib/database.types";
import type { EngagementFundingPrepareResult } from "../../../lib/engagement/funding-types";
import { formatEngagementFundingError } from "../../../lib/engagement/funding-errors";
import {
  nearNetworkIdForAuth,
  signEscrowFundingAuthorization,
  type EscrowCreateAuthorization,
} from "../../../lib/near/escrow-funding-authorization";

export type { EngagementFundingPrepareResult };

type PaymentRow = Database["public"]["Tables"]["engagement_escrow_payments"]["Row"];
type AssetRow = Database["public"]["Tables"]["assets"]["Row"];

function nearConfigForPayment(payment: PaymentRow) {
  return escrowNearConfigForPayment({
    escrow_contract_id: payment.escrow_contract_id,
    chain_id: payment.chain_id,
  });
}

export type EngagementFundingActionResult =
  | { ok: true; payment: EngagementFundingPrepareResult }
  | { ok: false; error: string };

function mapPaymentRow(
  payment: PaymentRow,
  asset: AssetRow,
): EngagementFundingPrepareResult {
  if (!payment.engagement_id) {
    throw new Error("Payment is not linked to an engagement.");
  }
  return {
    paymentId: payment.id,
    engagementId: payment.engagement_id,
    chainId: payment.chain_id,
    escrowContractId: payment.escrow_contract_id,
    assetStandard: asset.asset_standard,
    tokenContractId: asset.token_contract_id,
    amountSmallestUnits: normalizeDbNumericAmount(payment.amount),
    symbol: asset.symbol,
    decimals: asset.decimals,
    requesterNearAccountId: payment.requester_near_account_id,
    providerNearAccountId: payment.provider_near_account_id,
    onChainEscrowId:
      payment.on_chain_escrow_id == null
        ? null
        : String(payment.on_chain_escrow_id),
    status: payment.status,
    createTxHash: payment.create_tx_hash,
    fundTxHash: payment.fund_tx_hash,
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
    ftContractId: resolveAssetContractId({
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
  };
}

export async function prepareEngagementFunding(
  engagementId: string,
): Promise<EngagementFundingActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Sign in to fund this engagement." };
  }

  const escrowConfig = readEscrowNearRuntimeConfig();
  const chainId = chainIdForCurrentNearNetwork();

  const { data: payment, error } = await supabase.rpc(
    "prepare_engagement_funding",
    {
      p_engagement_id: engagementId,
      p_escrow_contract_id: escrowConfig.escrowContractId,
      p_chain_id: chainId,
    },
  );

  if (error) {
    return { ok: false, error: formatEngagementFundingError(error.message) };
  }
  if (!payment) {
    return { ok: false, error: "Could not prepare funding." };
  }

  const asset = await loadPaymentAsset(supabase, payment);
  if (!asset) {
    return { ok: false, error: "Asset metadata missing." };
  }

  return { ok: true, payment: mapPaymentRow(payment, asset) };
}

export async function issueEscrowCreateAuthorization(
  engagementId: string,
): Promise<
  { ok: true; authorization: EscrowCreateAuthorization } | { ok: false; error: string }
> {
  const loaded = await prepareEngagementFunding(engagementId);
  if (!loaded.ok) {
    return { ok: false, error: loaded.error };
  }
  const { payment } = loaded;
  if (payment.status === "funded") {
    return { ok: false, error: "Engagement already funded." };
  }

  try {
    const config = escrowNearConfigForPayment({
      escrow_contract_id: payment.escrowContractId,
      chain_id: payment.chainId,
    });
    const authorization = signEscrowFundingAuthorization({
      contractId: config.escrowContractId,
      networkId: nearNetworkIdForAuth(config.networkId),
      engagementId: payment.engagementId,
      requester: payment.requesterNearAccountId,
      provider: payment.providerNearAccountId,
      asset: payment.assetStandard,
      ftContractId: payment.tokenContractId,
      amountSmallestUnits: payment.amountSmallestUnits,
    });
    return { ok: true, authorization };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not sign authorization.";
    return { ok: false, error: message };
  }
}

export type EngagementFundingPrerequisites = {
  requesterWalletLinked: boolean;
  providerWalletLinked: boolean;
  requesterDisplayName: string;
  providerDisplayName: string;
  requesterNearAccountId: string | null;
  providerNearAccountId: string | null;
};

export async function loadEngagementFundingPrerequisites(
  engagementId: string,
): Promise<
  { ok: true; data: EngagementFundingPrerequisites } | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Sign in required." };
  }

  const { data, error } = await supabase.rpc(
    "get_engagement_funding_prerequisites",
    { p_engagement_id: engagementId },
  );

  if (error) {
    return { ok: false, error: error.message };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    return { ok: false, error: "Could not load funding prerequisites." };
  }

  return {
    ok: true,
    data: {
      requesterWalletLinked: Boolean(row.requester_wallet_linked),
      providerWalletLinked: Boolean(row.provider_wallet_linked),
      requesterDisplayName: row.requester_display_name ?? "Requester",
      providerDisplayName: row.provider_display_name ?? "Provider",
      requesterNearAccountId: row.requester_near_account_id ?? null,
      providerNearAccountId: row.provider_near_account_id ?? null,
    },
  };
}

export async function loadEngagementFundingStatus(
  engagementId: string,
): Promise<EngagementFundingActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Sign in required." };
  }

  const { data: payment, error } = await supabase
    .from("engagement_escrow_payments")
    .select("*")
    .eq("engagement_id", engagementId)
    .maybeSingle();

  if (error) {
    return { ok: false, error: formatEngagementFundingError(error.message) };
  }
  if (!payment) {
    return { ok: false, error: "not_prepared" };
  }

  const asset = await loadPaymentAsset(supabase, payment);
  if (!asset) {
    return { ok: false, error: "Asset metadata missing." };
  }

  return { ok: true, payment: mapPaymentRow(payment, asset) };
}

async function applyProgress(
  engagementId: string,
  status: PaymentRow["status"],
  fields: {
    onChainEscrowId?: string | null;
    createTxHash?: string | null;
    fundTxHash?: string | null;
    lastError?: string | null;
  },
): Promise<void> {
  const service = createServiceClient();
  const { error } = await service.rpc("record_engagement_payment_progress", {
    p_engagement_id: engagementId,
    p_status: status,
    p_on_chain_escrow_id: fields.onChainEscrowId
      ? Number(fields.onChainEscrowId)
      : undefined,
    p_create_tx_hash: fields.createTxHash ?? undefined,
    p_fund_tx_hash: fields.fundTxHash ?? undefined,
    p_last_error: fields.lastError ?? undefined,
  });
  if (error) {
    throw new Error(error.message);
  }
}

/** If create tx succeeded on-chain but reporting failed, recover escrow id from chain. */
export async function syncEngagementEscrowFromChain(
  engagementId: string,
): Promise<EngagementFundingActionResult> {
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
    return { ok: false, error: loadErr?.message ?? "Funding not prepared." };
  }
  if (payment.requester_user_id !== user.id) {
    return { ok: false, error: "Only the requester may sync funding state." };
  }
  if (payment.status === "funded" && payment.on_chain_escrow_id != null) {
    const asset = await loadPaymentAsset(supabase, payment);
    if (asset) {
      return { ok: true, payment: mapPaymentRow(payment, asset) };
    }
  }

  const asset = await loadPaymentAsset(supabase, payment);
  if (!asset) {
    return { ok: false, error: "Asset metadata missing." };
  }

  const config = nearConfigForPayment(payment);
  const escrowId = await findEscrowIdForEngagementByScan(config, engagementId);
  if (!escrowId) {
    return { ok: false, error: "No on-chain escrow for this engagement yet." };
  }

  try {
    const record = await viewEscrowRecord(config, escrowId);
    if (!record) {
      throw new Error("Escrow record not found on-chain");
    }
    const expectation = buildExpectation(payment, asset);
    assertEscrowRecordMatchesFunding(record, expectation);
    const nextStatus =
      record.status === "Funded" ? ("funded" as const) : ("create_submitted" as const);
    await applyProgress(engagementId, nextStatus, {
      onChainEscrowId: escrowId,
      lastError: null,
      createTxHash: payment.create_tx_hash ?? undefined,
    });

    const { data: refreshed } = await supabase
      .from("engagement_escrow_payments")
      .select("*")
      .eq("engagement_id", engagementId)
      .single();

    return {
      ok: true,
      payment: mapPaymentRow(refreshed ?? payment, asset),
    };
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Could not sync escrow from chain.";
    return { ok: false, error: message };
  }
}

export async function reportEngagementCreateTx(
  engagementId: string,
  txHash: string,
  claimedEscrowId?: string,
  txSignerNearAccountId?: string,
): Promise<EngagementFundingActionResult> {
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
    return { ok: false, error: loadErr?.message ?? "Funding not prepared." };
  }
  if (payment.requester_user_id !== user.id) {
    return { ok: false, error: "Only the requester may report transactions." };
  }
  if (payment.status === "funded") {
    return { ok: false, error: "Engagement already funded." };
  }

  if (
    payment.create_tx_hash &&
    payment.create_tx_hash === txHash &&
    payment.on_chain_escrow_id != null
  ) {
    const asset = await loadPaymentAsset(supabase, payment);
    if (asset) {
      return { ok: true, payment: mapPaymentRow(payment, asset) };
    }
  }

  const asset = await loadPaymentAsset(supabase, payment);
  if (!asset) {
    return { ok: false, error: "Asset metadata missing." };
  }

  const config = nearConfigForPayment(payment);
  try {
    const escrowId = await resolveEscrowIdAfterCreateTx(
      config,
      engagementId,
      txHash,
      [
        payment.requester_near_account_id,
        ...(txSignerNearAccountId?.trim()
          ? [txSignerNearAccountId.trim()]
          : []),
      ],
      claimedEscrowId,
    );
    const record = await viewEscrowRecord(config, escrowId);
    if (!record) {
      throw new Error("Escrow record not found after create");
    }
    const expectation = buildExpectation(payment, asset);
    assertEscrowRecordMatchesFunding(record, expectation);
    if (record.status !== "Pending" && record.status !== "Funded") {
      throw new Error(`Unexpected escrow status after create: ${record.status}`);
    }
    await applyProgress(engagementId, "create_submitted", {
      onChainEscrowId: escrowId,
      createTxHash: txHash,
      lastError: null,
    });

    const { data: refreshed } = await supabase
      .from("engagement_escrow_payments")
      .select("*")
      .eq("engagement_id", engagementId)
      .single();

    return {
      ok: true,
      payment: mapPaymentRow(refreshed ?? payment, asset),
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Create transaction failed.";
    await applyProgress(engagementId, "failed", {
      lastError: message,
      createTxHash: txHash,
    });
    return { ok: false, error: message };
  }
}

export async function reportEngagementFundTx(
  engagementId: string,
  txHash: string,
): Promise<EngagementFundingActionResult> {
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
    return { ok: false, error: loadErr?.message ?? "Funding not prepared." };
  }
  if (payment.requester_user_id !== user.id) {
    return { ok: false, error: "Only the requester may report transactions." };
  }
  if (payment.status === "funded") {
    if (payment.fund_tx_hash === txHash) {
      const asset = await loadPaymentAsset(supabase, payment);
      if (asset) {
        return { ok: true, payment: mapPaymentRow(payment, asset) };
      }
    }
    return { ok: false, error: "Engagement already funded." };
  }
  if (payment.on_chain_escrow_id == null) {
    return { ok: false, error: "Create escrow on-chain before funding." };
  }

  const asset = await loadPaymentAsset(supabase, payment);
  if (!asset) {
    return { ok: false, error: "Asset metadata missing." };
  }

  const config = nearConfigForPayment(payment);
  const escrowId = String(payment.on_chain_escrow_id);

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
      // Some wallet RPC hashes are not indexed; escrow state remains authoritative below.
    }
    const record = await viewEscrowRecord(config, escrowId);
    if (!record) {
      throw new Error("Escrow record not found");
    }
    const expectation = buildExpectation(payment, asset);
    assertFundingCompleteOnChain(record, expectation);

    await applyProgress(engagementId, "funded", {
      fundTxHash: txHash,
      lastError: null,
    });

    const { data: refreshed } = await supabase
      .from("engagement_escrow_payments")
      .select("*")
      .eq("engagement_id", engagementId)
      .single();

    return {
      ok: true,
      payment: mapPaymentRow(refreshed ?? payment, asset),
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Funding verification failed.";
    await applyProgress(engagementId, "failed", {
      fundTxHash: txHash,
      lastError: message,
    });
    return { ok: false, error: message };
  }
}

/** Server-side balance gate (soft) before prompting wallet. */
export async function checkRequesterFundingBalance(
  engagementId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  let loaded = await loadEngagementFundingStatus(engagementId);
  if (!loaded.ok && loaded.error === "not_prepared") {
    loaded = await prepareEngagementFunding(engagementId);
  }
  if (!loaded.ok) {
    return { ok: false, error: loaded.error };
  }
  const { payment } = loaded;
  if (payment.status === "funded") {
    return { ok: true };
  }

  const config = escrowNearConfigForPayment({
    escrow_contract_id: payment.escrowContractId,
    chain_id: payment.chainId,
  });
  const { readAssetBalance } = await import("@paidaid/near");
  const balance = await readAssetBalance(
    config,
    payment.requesterNearAccountId,
    {
      assetStandard: payment.assetStandard,
      tokenContractId: payment.tokenContractId,
    },
  );
  if (balance.status !== "ok" || !balance.smallestUnits) {
    return {
      ok: false,
      error: balance.message ?? "Could not read wallet balance.",
    };
  }
  const needed = smallestUnitsStringToBigInt(payment.amountSmallestUnits);
  const have = smallestUnitsStringToBigInt(balance.smallestUnits);
  if (have < needed) {
    return {
      ok: false,
      error: `Insufficient balance (need ${bigintToSmallestUnitsString(needed)} smallest units).`,
    };
  }
  return { ok: true };
}
