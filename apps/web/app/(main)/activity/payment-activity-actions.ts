"use server";

import { normalizeDbNumericAmount } from "@paidaid/shared";
import { createClient } from "../../../lib/supabase/server";
import { createServiceClient } from "../../../lib/supabase/service";
import { normalizeSummaryAmount } from "../../../lib/payments/payment-activity-format";
import type {
  PaymentActivityFilter,
  PaymentActivityPageData,
  PaymentActivityRow,
  PaymentActivitySummary,
} from "../../../lib/payments/payment-activity-types";
import { reconcileEngagementPaymentFromChain } from "../../../lib/payments/reconcile-engagement-payment";
import type { Database } from "../../../lib/database.types";

const PAGE_SIZE = 20;

type PaymentRow = Database["public"]["Tables"]["engagement_escrow_payments"]["Row"];
type AssetRow = Database["public"]["Tables"]["assets"]["Row"];
type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

async function loadMilestoneAmountsForPayment(
  supabase: SupabaseClient,
  payment: PaymentRow,
): Promise<string[] | undefined> {
  const intentId = payment.acceptance_intent_id;
  if (!intentId) {
    return undefined;
  }

  const { data: intent } = await supabase
    .from("acceptance_funding_intents")
    .select("payment_mode")
    .eq("id", intentId)
    .maybeSingle();

  if (intent?.payment_mode !== "milestones") {
    return undefined;
  }

  const { data: rows } = await supabase
    .from("engagement_milestones")
    .select("amount, position")
    .eq("acceptance_intent_id", intentId)
    .order("position");

  if (!rows?.length) {
    return undefined;
  }

  return rows.map((row) => normalizeDbNumericAmount(row.amount));
}

function mapActivityRow(
  row: Database["public"]["Functions"]["list_my_payment_activity"]["Returns"][number],
): PaymentActivityRow {
  return {
    eventId: row.event_id,
    paymentId: row.payment_id,
    engagementId: row.engagement_id,
    requestTitle: row.request_title,
    viewerRole: row.viewer_role as "requester" | "provider",
    kind: row.kind,
    status: row.status,
    amountSmallestUnits: normalizeDbNumericAmount(row.amount),
    assetSymbol: row.asset_symbol,
    assetDecimals: row.asset_decimals,
    chainId: row.chain_id,
    txHash: row.tx_hash,
    occurredAt: row.occurred_at,
    confirmedAt: row.confirmed_at,
    lastError: row.last_error,
  };
}

function mapSummary(
  row: Database["public"]["Functions"]["get_my_payment_summary"]["Returns"][number],
): PaymentActivitySummary {
  return {
    totalFundedSmallestUnits: normalizeSummaryAmount(row.total_funded_amount),
    lockedInEscrowSmallestUnits: normalizeSummaryAmount(row.locked_in_escrow_amount),
    totalReceivedSmallestUnits: normalizeSummaryAmount(row.total_received_amount),
    totalRefundedSmallestUnits: normalizeSummaryAmount(row.total_refunded_amount),
    fundedCount: Number(row.funded_count),
    lockedCount: Number(row.locked_count),
    receivedCount: Number(row.received_count),
    refundCount: Number(row.refund_count),
  };
}

async function applyFundingProgress(
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

export async function loadPaymentActivityPage(options?: {
  offset?: number;
  filter?: PaymentActivityFilter;
}): Promise<
  | { ok: true; data: PaymentActivityPageData }
  | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Sign in to view payment activity." };
  }

  const offset = options?.offset ?? 0;
  const filter = options?.filter ?? {};

  const { data: summaryRows, error: summaryErr } = await supabase.rpc(
    "get_my_payment_summary",
  );
  if (summaryErr) {
    return { ok: false, error: summaryErr.message };
  }
  const summary = mapSummary(summaryRows?.[0] ?? {
    total_funded_amount: "0",
    locked_in_escrow_amount: "0",
    total_received_amount: "0",
    total_refunded_amount: "0",
    funded_count: 0,
    locked_count: 0,
    received_count: 0,
    refund_count: 0,
  });

  const { data: rows, error: listErr } = await supabase.rpc(
    "list_my_payment_activity",
    {
      p_limit: PAGE_SIZE + 1,
      p_offset: offset,
      p_kind: filter.kind ?? undefined,
      p_status: filter.status ?? undefined,
    },
  );
  if (listErr) {
    return { ok: false, error: listErr.message };
  }

  const list = rows ?? [];
  const hasMore = list.length > PAGE_SIZE;
  const items = list.slice(0, PAGE_SIZE).map(mapActivityRow);

  return {
    ok: true,
    data: { summary, items, hasMore },
  };
}

export async function reconcileMyPaymentActivity(): Promise<
  { ok: true; updated: number } | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Sign in required." };
  }

  const { data: payments, error } = await supabase
    .from("engagement_escrow_payments")
    .select("*")
    .or(`requester_user_id.eq.${user.id},provider_user_id.eq.${user.id}`);

  if (error) {
    return { ok: false, error: error.message };
  }

  const pending = (payments ?? []).filter((p) => {
    if (
      p.status === "prepared" ||
      p.status === "create_submitted" ||
      p.status === "deposit_submitted"
    ) {
      return true;
    }
    if (p.settlement_status === "release_submitted") {
      return true;
    }
    if (
      p.status === "funded" &&
      p.settlement_status !== "released" &&
      p.on_chain_escrow_id != null
    ) {
      return true;
    }
    return false;
  });

  const assetIds = [...new Set(pending.map((p) => p.asset_id))];
  const { data: assets } = await supabase
    .from("assets")
    .select("*")
    .in("id", assetIds);
  const assetById = new Map((assets ?? []).map((a) => [a.id, a as AssetRow]));

  let updated = 0;
  for (const payment of pending) {
    const asset = assetById.get(payment.asset_id);
    if (!asset) {
      continue;
    }
    const milestoneAmountsSmallest = await loadMilestoneAmountsForPayment(
      supabase,
      payment,
    );
    const outcome = await reconcileEngagementPaymentFromChain(
      payment,
      asset,
      user.id,
      { applyFundingProgress, applySettlementProgress },
      { milestoneAmountsSmallest },
    );
    if (outcome.changed) {
      updated += 1;
      const service = createServiceClient();
      await service.rpc("sync_engagement_payment_events", {
        p_payment_id: payment.id,
      });
    }
  }

  return { ok: true, updated };
}
