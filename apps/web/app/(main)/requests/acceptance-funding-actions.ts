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
} from "@paidaid/shared";
import { revalidatePath } from "next/cache";
import { createClient } from "../../../lib/supabase/server";
import { createServiceClient } from "../../../lib/supabase/service";
import {
  chainIdForCurrentNearNetwork,
  escrowNearConfigForPayment,
  readEscrowNearRuntimeConfig,
} from "../../../lib/near/escrow-config";
import type { Database } from "../../../lib/database.types";
import type {
  AcceptanceFundingIntentStatus,
  AcceptanceFundingPrepareResult,
} from "../../../lib/acceptance/acceptance-funding-types";
import { formatEngagementFundingError } from "../../../lib/engagement/funding-errors";
import {
  nearNetworkIdForAuth,
  signEscrowFundingAuthorization,
  type EscrowCreateAuthorization,
} from "../../../lib/near/escrow-funding-authorization";
import { randomBytes } from "node:crypto";

export type { AcceptanceFundingPrepareResult };

type IntentRow = Database["public"]["Tables"]["acceptance_funding_intents"]["Row"];
type PaymentRow = Database["public"]["Tables"]["engagement_escrow_payments"]["Row"];
type AssetRow = Database["public"]["Tables"]["assets"]["Row"];

const AUTH_TTL_MS = 30 * 60 * 1000;

const ACTIVE_INTENT_STATUSES: AcceptanceFundingIntentStatus[] = [
  "awaiting_wallet",
  "create_submitted",
  "fund_submitted",
  "funding_verified",
  "finalized",
];

export type AcceptanceFundingActionResult =
  | { ok: true; intent: AcceptanceFundingPrepareResult }
  | { ok: false; error: string };

export type AcceptanceFundingSnapshotResult =
  | { ok: true; intent: AcceptanceFundingPrepareResult | null }
  | { ok: false; error: string };

function nearConfigForIntent(intent: IntentRow) {
  return escrowNearConfigForPayment({
    escrow_contract_id: intent.escrow_contract_id,
    chain_id: intent.chain_id,
  });
}

function mapIntent(
  intent: IntentRow,
  asset: AssetRow,
  payment: PaymentRow,
): AcceptanceFundingPrepareResult {
  return {
    intentId: intent.id,
    paymentId: payment.id,
    requestId: intent.request_id,
    responseId: intent.response_id,
    plannedEngagementId: intent.planned_engagement_id,
    chainId: intent.chain_id,
    escrowContractId: intent.escrow_contract_id,
    assetStandard: asset.asset_standard,
    tokenContractId: asset.token_contract_id,
    amountSmallestUnits: normalizeDbNumericAmount(intent.amount),
    symbol: asset.symbol,
    decimals: asset.decimals,
    requesterNearAccountId: intent.requester_near_account_id,
    providerNearAccountId: intent.provider_near_account_id,
    status: intent.status,
    createTxHash: intent.create_tx_hash,
    fundTxHash: intent.fund_tx_hash,
    onChainEscrowId:
      intent.on_chain_escrow_id == null
        ? null
        : String(intent.on_chain_escrow_id),
  };
}

async function loadIntentPaymentAsset(
  supabase: Awaited<ReturnType<typeof createClient>>,
  intent: IntentRow,
): Promise<{ payment: PaymentRow; asset: AssetRow } | null> {
  if (!intent.payment_id) {
    return null;
  }
  const { data: payment } = await supabase
    .from("engagement_escrow_payments")
    .select("*")
    .eq("id", intent.payment_id)
    .maybeSingle();
  if (!payment) {
    return null;
  }
  const { data: asset } = await supabase
    .from("assets")
    .select("*")
    .eq("id", intent.asset_id)
    .maybeSingle();
  if (!asset) {
    return null;
  }
  return { payment, asset };
}

function buildExpectation(
  intent: IntentRow,
  asset: AssetRow,
): FundingVerificationExpectation {
  return {
    engagementId: intent.planned_engagement_id,
    requesterNearAccountId: intent.requester_near_account_id,
    providerNearAccountId: intent.provider_near_account_id,
    amountSmallestUnits: normalizeDbNumericAmount(intent.amount),
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

async function applyIntentProgress(
  intentId: string,
  intentStatus: AcceptanceFundingIntentStatus,
  paymentStatus: PaymentRow["status"],
  fields: {
    onChainEscrowId?: string | null;
    createTxHash?: string | null;
    fundTxHash?: string | null;
    lastError?: string | null;
  },
): Promise<void> {
  const service = createServiceClient();
  const { error } = await service.rpc("record_acceptance_funding_progress", {
    p_intent_id: intentId,
    p_intent_status: intentStatus,
    p_payment_status: paymentStatus,
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

async function finalizeAcceptance(intentId: string): Promise<string> {
  const service = createServiceClient();
  const { data, error } = await service.rpc("finalize_acceptance_after_funding", {
    p_intent_id: intentId,
  });
  if (error) {
    throw new Error(error.message);
  }
  return String(data);
}

function revalidateAfterAcceptance(requestId: string, engagementId: string) {
  revalidatePath(`/requests/${requestId}`);
  revalidatePath(`/engagements/${engagementId}`);
  revalidatePath("/responses/mine");
  revalidatePath("/notifications");
  revalidatePath("/engagements", "layout");
}

export async function prepareAcceptanceFunding(
  requestId: string,
  responseId: string,
): Promise<AcceptanceFundingActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Sign in to accept this offer." };
  }

  const escrowConfig = readEscrowNearRuntimeConfig();
  const chainId = chainIdForCurrentNearNetwork();
  const nonce =
    randomBytes(16).toString("hex") + randomBytes(16).toString("hex");
  const authExpiresAt = new Date(Date.now() + AUTH_TTL_MS);

  const { data: intent, error } = await supabase.rpc("prepare_acceptance_funding", {
    p_request_id: requestId,
    p_response_id: responseId,
    p_escrow_contract_id: escrowConfig.escrowContractId,
    p_chain_id: chainId,
    p_auth_nonce: nonce,
    p_auth_expires_at: authExpiresAt.toISOString(),
  });

  if (error) {
    return { ok: false, error: formatEngagementFundingError(error.message) };
  }
  if (!intent) {
    return { ok: false, error: "Could not prepare acceptance funding." };
  }

  const loaded = await loadIntentPaymentAsset(supabase, intent);
  if (!loaded) {
    return { ok: false, error: "Funding record missing." };
  }

  return {
    ok: true,
    intent: mapIntent(intent, loaded.asset, loaded.payment),
  };
}

export async function issueAcceptanceEscrowCreateAuthorization(
  intentId: string,
): Promise<
  { ok: true; authorization: EscrowCreateAuthorization } | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Sign in required." };
  }

  const { data: intent, error } = await supabase.rpc("get_acceptance_funding_intent", {
    p_intent_id: intentId,
  });
  if (error || !intent) {
    return { ok: false, error: error?.message ?? "Intent not found." };
  }
  if (intent.status === "finalized") {
    return { ok: false, error: "Acceptance already finalized." };
  }

  const { data: asset } = await supabase
    .from("assets")
    .select("*")
    .eq("id", intent.asset_id)
    .maybeSingle();
  if (!asset) {
    return { ok: false, error: "Asset metadata missing." };
  }

  try {
    const config = nearConfigForIntent(intent);
    const expiresAtNs = BigInt(
      Math.floor(new Date(intent.auth_expires_at).getTime() * 1_000_000),
    );
    const authorization = signEscrowFundingAuthorization({
      contractId: config.escrowContractId,
      networkId: nearNetworkIdForAuth(config.networkId),
      engagementId: intent.planned_engagement_id,
      requester: intent.requester_near_account_id,
      provider: intent.provider_near_account_id,
      asset: asset.asset_standard,
      ftContractId: asset.token_contract_id,
      amountSmallestUnits: normalizeDbNumericAmount(intent.amount),
      nonce: intent.auth_nonce,
      expiresAtNs,
    });
    return { ok: true, authorization };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not sign authorization.";
    return { ok: false, error: message };
  }
}

export async function loadActiveAcceptanceFundingForResponse(
  requestId: string,
  responseId: string,
): Promise<AcceptanceFundingSnapshotResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Sign in required." };
  }

  const { data: row, error } = await supabase
    .from("acceptance_funding_intents")
    .select("*")
    .eq("request_id", requestId)
    .eq("response_id", responseId)
    .in("status", ACTIVE_INTENT_STATUSES)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return { ok: false, error: error.message };
  }
  if (!row) {
    return { ok: true, intent: null };
  }

  const loaded = await loadIntentPaymentAsset(supabase, row);
  if (!loaded) {
    return { ok: false, error: "Funding record missing." };
  }

  return { ok: true, intent: mapIntent(row, loaded.asset, loaded.payment) };
}

export async function loadInFlightAcceptanceResponseId(
  requestId: string,
): Promise<{ ok: true; responseId: string | null } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Sign in required." };
  }

  const { data: row, error } = await supabase
    .from("acceptance_funding_intents")
    .select("response_id")
    .eq("request_id", requestId)
    .in("status", [
      "awaiting_wallet",
      "create_submitted",
      "fund_submitted",
      "funding_verified",
    ])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true, responseId: row?.response_id ?? null };
}

export async function loadAcceptanceFundingIntent(
  intentId: string,
): Promise<AcceptanceFundingActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Sign in required." };
  }

  const { data: intent, error } = await supabase.rpc("get_acceptance_funding_intent", {
    p_intent_id: intentId,
  });
  if (error || !intent) {
    return { ok: false, error: error?.message ?? "Intent not found." };
  }

  const loaded = await loadIntentPaymentAsset(supabase, intent);
  if (!loaded) {
    return { ok: false, error: "Funding record missing." };
  }

  return { ok: true, intent: mapIntent(intent, loaded.asset, loaded.payment) };
}

export async function syncAcceptanceEscrowFromChain(
  intentId: string,
): Promise<AcceptanceFundingActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Sign in required." };
  }

  const { data: intent, error: intentErr } = await supabase.rpc(
    "get_acceptance_funding_intent",
    { p_intent_id: intentId },
  );
  if (intentErr || !intent) {
    return { ok: false, error: intentErr?.message ?? "Intent not found." };
  }
  if (intent.requester_user_id !== user.id) {
    return { ok: false, error: "Only the requester may sync funding state." };
  }

  const loaded = await loadIntentPaymentAsset(supabase, intent);
  if (!loaded) {
    return { ok: false, error: "Funding record missing." };
  }

  if (
    intent.status === "finalized" ||
    (loaded.payment.status === "funded" && intent.on_chain_escrow_id != null)
  ) {
    return {
      ok: true,
      intent: mapIntent(intent, loaded.asset, loaded.payment),
    };
  }

  const config = nearConfigForIntent(intent);
  const escrowId = await findEscrowIdForEngagementByScan(
    config,
    intent.planned_engagement_id,
  );
  if (!escrowId) {
    return { ok: false, error: "No on-chain escrow for this acceptance yet." };
  }

  try {
    const record = await viewEscrowRecord(config, escrowId);
    if (!record) {
      throw new Error("Escrow record not found on-chain");
    }
    const expectation = buildExpectation(intent, loaded.asset);
    assertEscrowRecordMatchesFunding(record, expectation);

    const nextIntentStatus: AcceptanceFundingIntentStatus =
      record.status === "Funded" ? "funding_verified" : "create_submitted";
    const nextPaymentStatus =
      record.status === "Funded" ? ("funded" as const) : ("create_submitted" as const);

    await applyIntentProgress(intentId, nextIntentStatus, nextPaymentStatus, {
      onChainEscrowId: escrowId,
      lastError: null,
      createTxHash: intent.create_tx_hash ?? undefined,
    });

    if (nextIntentStatus === "funding_verified") {
      const engagementId = await finalizeAcceptance(intentId);
      revalidateAfterAcceptance(intent.request_id, engagementId);
    }

    const refreshed = await loadAcceptanceFundingIntent(intentId);
    return refreshed.ok
      ? refreshed
      : { ok: false, error: "Could not reload intent." };
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Could not sync escrow from chain.";
    return { ok: false, error: message };
  }
}

export async function reportAcceptanceCreateTx(
  intentId: string,
  txHash: string,
  claimedEscrowId?: string,
  txSignerNearAccountId?: string,
): Promise<AcceptanceFundingActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Sign in required." };
  }

  const { data: intent, error: intentErr } = await supabase.rpc(
    "get_acceptance_funding_intent",
    { p_intent_id: intentId },
  );
  if (intentErr || !intent) {
    return { ok: false, error: intentErr?.message ?? "Intent not found." };
  }
  if (intent.requester_user_id !== user.id) {
    return { ok: false, error: "Only the requester may report transactions." };
  }
  if (intent.status === "finalized") {
    return { ok: false, error: "Acceptance already finalized." };
  }

  if (
    intent.create_tx_hash === txHash &&
    intent.on_chain_escrow_id != null
  ) {
    const loaded = await loadIntentPaymentAsset(supabase, intent);
    if (loaded) {
      return { ok: true, intent: mapIntent(intent, loaded.asset, loaded.payment) };
    }
  }

  const loaded = await loadIntentPaymentAsset(supabase, intent);
  if (!loaded) {
    return { ok: false, error: "Funding record missing." };
  }

  const config = nearConfigForIntent(intent);
  try {
    const escrowId = await resolveEscrowIdAfterCreateTx(
      config,
      intent.planned_engagement_id,
      txHash,
      [
        intent.requester_near_account_id,
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
    const expectation = buildExpectation(intent, loaded.asset);
    assertEscrowRecordMatchesFunding(record, expectation);
    if (record.status !== "Pending" && record.status !== "Funded") {
      throw new Error(`Unexpected escrow status after create: ${record.status}`);
    }

    await applyIntentProgress(intentId, "create_submitted", "create_submitted", {
      onChainEscrowId: escrowId,
      createTxHash: txHash,
      lastError: null,
    });

    return await loadAcceptanceFundingIntent(intentId);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Create transaction failed.";
    await applyIntentProgress(intentId, "failed", "failed", {
      lastError: message,
      createTxHash: txHash,
    });
    return { ok: false, error: message };
  }
}

export async function reportAcceptanceFundTx(
  intentId: string,
  txHash: string,
): Promise<
  | { ok: true; intent: AcceptanceFundingPrepareResult; engagementId: string }
  | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Sign in required." };
  }

  const { data: intent, error: intentErr } = await supabase.rpc(
    "get_acceptance_funding_intent",
    { p_intent_id: intentId },
  );
  if (intentErr || !intent) {
    return { ok: false, error: intentErr?.message ?? "Intent not found." };
  }
  if (intent.requester_user_id !== user.id) {
    return { ok: false, error: "Only the requester may report transactions." };
  }
  if (intent.status === "finalized") {
    const engagementId = intent.planned_engagement_id;
    const loaded = await loadIntentPaymentAsset(supabase, intent);
    if (loaded && intent.fund_tx_hash === txHash) {
      return {
        ok: true,
        engagementId,
        intent: mapIntent(intent, loaded.asset, loaded.payment),
      };
    }
    return { ok: false, error: "Acceptance already finalized." };
  }
  if (intent.on_chain_escrow_id == null) {
    return { ok: false, error: "Create escrow on-chain before funding." };
  }

  const loaded = await loadIntentPaymentAsset(supabase, intent);
  if (!loaded) {
    return { ok: false, error: "Funding record missing." };
  }

  const config = nearConfigForIntent(intent);
  const escrowId = String(intent.on_chain_escrow_id);

  try {
    try {
      const rpcOutcome = await fetchTxFinalOutcome(
        config,
        txHash,
        intent.requester_near_account_id,
      );
      assertTransactionFinalSuccess(rpcOutcome);
    } catch (e) {
      if (e instanceof TransactionExecutionFailedError) {
        throw e;
      }
    }

    const record = await viewEscrowRecord(config, escrowId);
    if (!record) {
      throw new Error("Escrow record not found");
    }
    const expectation = buildExpectation(intent, loaded.asset);
    assertFundingCompleteOnChain(record, expectation);

    await applyIntentProgress(intentId, "funding_verified", "funded", {
      fundTxHash: txHash,
      lastError: null,
    });

    const engagementId = await finalizeAcceptance(intentId);
    revalidateAfterAcceptance(intent.request_id, engagementId);

    const refreshed = await loadAcceptanceFundingIntent(intentId);
    if (!refreshed.ok) {
      return { ok: false, error: "Funding verified but could not reload state." };
    }
    return { ok: true, intent: refreshed.intent, engagementId };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Funding verification failed.";
    await applyIntentProgress(intentId, "failed", "failed", {
      fundTxHash: txHash,
      lastError: message,
    });
    return { ok: false, error: message };
  }
}

/** Recover finalize when on-chain funding and DB intent are verified but marketplace rows were not created. */
export async function reconcileAcceptanceFinalization(
  intentId: string,
): Promise<
  | { ok: true; engagementId: string; intent: AcceptanceFundingPrepareResult }
  | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Sign in required." };
  }

  const { data: intent, error: intentErr } = await supabase.rpc(
    "get_acceptance_funding_intent",
    { p_intent_id: intentId },
  );
  if (intentErr || !intent) {
    return { ok: false, error: intentErr?.message ?? "Intent not found." };
  }
  if (intent.requester_user_id !== user.id) {
    return { ok: false, error: "Forbidden." };
  }
  if (intent.status === "finalized") {
    const loaded = await loadIntentPaymentAsset(supabase, intent);
    return loaded
      ? {
          ok: true,
          engagementId: intent.planned_engagement_id,
          intent: mapIntent(intent, loaded.asset, loaded.payment),
        }
      : { ok: false, error: "Funding record missing." };
  }

  const loaded = await loadIntentPaymentAsset(supabase, intent);
  if (!loaded) {
    return { ok: false, error: "Funding record missing." };
  }

  if (intent.status !== "funding_verified" || loaded.payment.status !== "funded") {
    const synced = await syncAcceptanceEscrowFromChain(intentId);
    if (!synced.ok) {
      return { ok: false, error: synced.error };
    }
    if (synced.intent.status === "finalized") {
      return {
        ok: true,
        engagementId: synced.intent.plannedEngagementId,
        intent: synced.intent,
      };
    }
    return { ok: false, error: "Funding not verified yet." };
  }

  try {
    const engagementId = await finalizeAcceptance(intentId);
    revalidateAfterAcceptance(intent.request_id, engagementId);
    const refreshed = await loadAcceptanceFundingIntent(intentId);
    if (!refreshed.ok) {
      return { ok: false, error: "Finalized but could not reload." };
    }
    return {
      ok: true,
      engagementId,
      intent: refreshed.intent,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Finalize failed.";
    return { ok: false, error: message };
  }
}

export async function checkAcceptanceFundingBalance(
  intentId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const loaded = await loadAcceptanceFundingIntent(intentId);
  if (!loaded.ok) {
    return { ok: false, error: loaded.error };
  }
  const { intent } = loaded;
  if (intent.status === "finalized") {
    return { ok: true };
  }

  const config = escrowNearConfigForPayment({
    escrow_contract_id: intent.escrowContractId,
    chain_id: intent.chainId,
  });
  const { readAssetBalance } = await import("@paidaid/near");
  const balance = await readAssetBalance(
    config,
    intent.requesterNearAccountId,
    {
      assetStandard: intent.assetStandard,
      tokenContractId: intent.tokenContractId,
    },
  );
  if (balance.status !== "ok" || !balance.smallestUnits) {
    return {
      ok: false,
      error: balance.message ?? "Could not read wallet balance.",
    };
  }
  const needed = smallestUnitsStringToBigInt(intent.amountSmallestUnits);
  const have = smallestUnitsStringToBigInt(balance.smallestUnits);
  if (have < needed) {
    return {
      ok: false,
      error: `Insufficient balance (need ${bigintToSmallestUnitsString(needed)} smallest units).`,
    };
  }
  return { ok: true };
}
