import type { createClient } from "../../../lib/supabase/server";
import type { Database } from "../../../lib/database.types";
import {
  formatBudgetSmallestUnits,
  normalizeAssetDecimals,
} from "../../../lib/requests/format-budget";
import { normalizeDbNumericAmount } from "@paidaid/shared";
import { normalizeSummaryAmount } from "../../../lib/payments/payment-activity-format";
import type { PaymentActivityPageData } from "../../../lib/payments/payment-activity-types";

export type ActivityTab =
  | "Posted"
  | "Offers"
  | "In progress"
  | "Completed"
  | "Payments";

export type ActivityPostedCard = {
  id: string;
  title: string;
  statusClass: "open" | "review" | "other";
  statusText: string;
  responseCount: number;
  budgetHuman: string;
  symbol: string;
  dueShort: string;
  ctaLabel: string;
  href: string;
};

export type ActivityOfferCard = {
  id: string;
  title: string;
  statusClass: "open" | "review" | "other";
  statusText: string;
  budgetHuman: string;
  symbol: string;
  dueShort: string;
  ctaLabel: string;
  href: string;
};

export type ActivityEngagementCard = {
  id: string;
  title: string;
  statusClass: "open" | "review" | "other";
  statusText: string;
  budgetHuman: string;
  symbol: string;
  dueShort: string;
  ctaLabel: string;
  href: string;
};

export type ActivityData = {
  counts: Record<ActivityTab, number>;
  posted: ActivityPostedCard[];
  offers: ActivityOfferCard[];
  inProgress: ActivityEngagementCard[];
  completed: ActivityEngagementCard[];
  payments: PaymentActivityPageData;
};

function formatDueShort(iso: string | null): string {
  if (!iso) {
    return "—";
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return "—";
  }
  return `Due ${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

type Client = Awaited<ReturnType<typeof createClient>>;

async function loadAssetMap(
  supabase: Client,
  assetIds: string[],
): Promise<
  Map<string, { symbol: string; decimals: number }>
> {
  if (assetIds.length === 0) {
    return new Map();
  }
  const { data } = await supabase
    .from("assets")
    .select("id, symbol, decimals")
    .in("id", assetIds);
  return new Map((data ?? []).map((a) => [a.id, a] as const));
}

export async function loadActivityPageData(
  supabase: Client,
  userId: string,
): Promise<ActivityData> {
  const { data: requests } = await supabase
    .from("requests")
    .select(
      "id, title, status, published_at, deadline_at, budget_amount, budget_asset_id",
    )
    .eq("requester_id", userId)
    .order("updated_at", { ascending: false });

  const postedRows = (requests ?? []).filter((r) => r.published_at != null);
  const requestIds = postedRows.map((r) => r.id);

  const { data: responseCountRows } =
    requestIds.length > 0
      ? await supabase
          .from("request_responses_api")
          .select("request_id")
          .in("request_id", requestIds)
          .neq("status", "withdrawn")
      : { data: [] };

  const responseCountByRequest = new Map<string, number>();
  for (const row of responseCountRows ?? []) {
    const rid = (row as { request_id: string }).request_id;
    responseCountByRequest.set(rid, (responseCountByRequest.get(rid) ?? 0) + 1);
  }

  const { data: assignForPosted } =
    requestIds.length > 0
      ? await supabase
          .from("assignments")
          .select("request_id, engagements ( id )")
          .in("request_id", requestIds)
      : { data: [] };

  const engagementIdByRequestId = new Map<string, string>();
  for (const row of assignForPosted ?? []) {
    const r = row as {
      request_id: string;
      engagements: { id: string } | { id: string }[] | null;
    };
    const eng = r.engagements;
    const eid = Array.isArray(eng) ? eng[0]?.id : eng?.id;
    if (eid) {
      engagementIdByRequestId.set(r.request_id, eid);
    }
  }

  const assetIdsPosted = [
    ...new Set(postedRows.map((r) => r.budget_asset_id).filter(Boolean)),
  ];
  const assetMapPosted = await loadAssetMap(supabase, assetIdsPosted);

  const posted: ActivityPostedCard[] = postedRows.map((r) => {
    const asset = assetMapPosted.get(r.budget_asset_id);
    const budgetHuman =
      asset != null
        ? formatBudgetSmallestUnits(String(r.budget_amount), asset.decimals)
        : String(r.budget_amount);
    const sym = asset?.symbol ?? "";
    const n = responseCountByRequest.get(r.id) ?? 0;
    const status = r.status as Database["public"]["Enums"]["request_status"];

    let statusClass: ActivityPostedCard["statusClass"] = "other";
    let statusText: string;
    if (status === "open") {
      statusClass = "open";
      statusText = `OPEN · ${n} RESPONSE${n === 1 ? "" : "S"}`;
    } else if (status === "assigned") {
      statusClass = "review";
      statusText = `IN REVIEW · ${n} RESPONSE${n === 1 ? "" : "S"}`;
    } else {
      statusText = `${status.replace(/_/g, " ").toUpperCase()} · ${n} RESPONSE${n === 1 ? "" : "S"}`;
    }

    let ctaLabel = "View request";
    let href = `/requests/${r.id}`;
    if (status === "open" && n > 0) {
      ctaLabel = "Compare offers";
    } else if (status === "assigned") {
      ctaLabel = engagementIdByRequestId.has(r.id)
        ? "Open engagement"
        : "View responses";
      if (engagementIdByRequestId.has(r.id)) {
        href = `/engagements/${engagementIdByRequestId.get(r.id)}`;
      }
    }

    return {
      id: r.id,
      title: r.title,
      statusClass,
      statusText,
      responseCount: n,
      budgetHuman,
      symbol: sym,
      dueShort: formatDueShort(r.deadline_at),
      ctaLabel,
      href,
    };
  });

  const { data: pp } = await supabase
    .from("provider_profiles")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  const { data: responseRows } = pp
    ? await supabase
        .from("request_responses_api")
        .select(
          `
          id,
          status,
          proposed_amount,
          request_id,
          requests ( id, title, status, deadline_at ),
          assets!request_responses_proposed_asset_id_fkey ( symbol, decimals )
        `,
        )
        .eq("provider_profile_id", pp.id)
        .neq("status", "withdrawn")
        .order("created_at", { ascending: false })
    : { data: [] };

  const offerRows = (responseRows ?? []).filter(
    (x) => (x as { status: string }).status !== "accepted",
  );

  const offers: ActivityOfferCard[] = offerRows.map((raw) => {
    const r = raw as {
      id: string;
      status: Database["public"]["Enums"]["response_status"];
      proposed_amount: string | number;
      request_id: string;
      requests: {
        title: string;
        deadline_at: string | null;
      } | null;
      assets: { symbol: string; decimals: number } | null;
    };

    const asset = r.assets;
    const decimals = normalizeAssetDecimals(asset?.decimals);
    const sym = asset?.symbol ?? "";
    const budgetHuman = formatBudgetSmallestUnits(r.proposed_amount, decimals);

    const rs = r.status;
    let statusClass: ActivityOfferCard["statusClass"] = "other";
    let statusText: string;
    if (rs === "pending") {
      statusClass = "open";
      statusText = "PENDING OFFER";
    } else if (rs === "rejected") {
      statusText = "REJECTED";
    } else {
      statusText = rs.toUpperCase();
    }

    const req = r.requests;
    const due = req?.deadline_at ? formatDueShort(req.deadline_at) : "—";

    const ctaLabel = "View request";
    const href = `/requests/${r.request_id}`;

    return {
      id: r.id,
      title: req?.title ?? "Request",
      statusClass,
      statusText,
      budgetHuman,
      symbol: sym,
      dueShort: due,
      ctaLabel,
      href,
    };
  });

  const { data: assignmentRows } = await supabase
    .from("assignments")
    .select(
      `
      engagements (
        id,
        status
      ),
      requests (
        title,
        deadline_at,
        budget_amount,
        budget_asset_id
      )
    `,
    )
    .or(`requester_id.eq.${userId},provider_user_id.eq.${userId}`);

  const engagementAssetIds = [
    ...new Set(
      (assignmentRows ?? [])
        .map(
          (row) =>
            (row as { requests: { budget_asset_id: string } | null }).requests
              ?.budget_asset_id,
        )
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const engAssetMap = await loadAssetMap(supabase, engagementAssetIds);

  const engagementCards: ActivityEngagementCard[] = [];

  for (const row of assignmentRows ?? []) {
    const typed = row as {
      engagements: { id: string; status: string } | { id: string; status: string }[] | null;
      requests: {
        title: string;
        deadline_at: string | null;
        budget_amount: number;
        budget_asset_id: string;
      } | null;
    };
    const eng = typed.engagements;
    const e = Array.isArray(eng) ? eng[0] : eng;
    const req = typed.requests;
    if (!e || !req) {
      continue;
    }

    const asset = engAssetMap.get(req.budget_asset_id);
    const budgetHuman =
      asset != null
        ? formatBudgetSmallestUnits(String(req.budget_amount), asset.decimals)
        : String(req.budget_amount);
    const sym = asset?.symbol ?? "";

    const st = e.status as Database["public"]["Enums"]["engagement_status"];
    const statusText = st === "active" ? "ACTIVE" : "COMPLETED";
    const statusClass: ActivityEngagementCard["statusClass"] =
      st === "active" ? "open" : st === "completed" ? "review" : "other";

    engagementCards.push({
      id: e.id,
      title: req.title,
      statusClass,
      statusText,
      budgetHuman,
      symbol: sym,
      dueShort: formatDueShort(req.deadline_at),
      ctaLabel: "Open",
      href: `/engagements/${e.id}`,
    });
  }

  const inProgress = engagementCards.filter((c) => c.statusText === "ACTIVE");
  const completedEng = engagementCards.filter(
    (c) => c.statusText === "COMPLETED",
  );

  const { data: summaryRows } = await supabase.rpc("get_my_payment_summary");
  const summaryRow = summaryRows?.[0];
  const { data: paymentEvents } = await supabase.rpc("list_my_payment_activity", {
    p_limit: 21,
    p_offset: 0,
  });

  const paymentList = paymentEvents ?? [];
  const paymentHasMore = paymentList.length > 20;
  const paymentItems = paymentList.slice(0, 20).map((row) => ({
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
  }));

  const summaryExtended = summaryRow as typeof summaryRow & {
    primary_asset_symbol?: string;
    primary_asset_decimals?: number;
    distinct_asset_count?: number;
  };
  const payments: PaymentActivityPageData = {
    summary: {
      totalFundedSmallestUnits: normalizeSummaryAmount(
        summaryRow?.total_funded_amount,
      ),
      lockedInEscrowSmallestUnits: normalizeSummaryAmount(
        summaryRow?.locked_in_escrow_amount,
      ),
      totalReceivedSmallestUnits: normalizeSummaryAmount(
        summaryRow?.total_received_amount,
      ),
      totalRefundedSmallestUnits: normalizeSummaryAmount(
        summaryRow?.total_refunded_amount,
      ),
      fundedCount: Number(summaryRow?.funded_count ?? 0),
      lockedCount: Number(summaryRow?.locked_count ?? 0),
      receivedCount: Number(summaryRow?.received_count ?? 0),
      refundCount: Number(summaryRow?.refund_count ?? 0),
      primaryAssetSymbol: summaryExtended?.primary_asset_symbol ?? "NEAR",
      primaryAssetDecimals: Number(summaryExtended?.primary_asset_decimals ?? 24),
      distinctAssetCount: Number(summaryExtended?.distinct_asset_count ?? 1),
    },
    items: paymentItems,
    hasMore: paymentHasMore,
  };

  const counts: Record<ActivityTab, number> = {
    Posted: posted.length,
    Offers: offers.length,
    "In progress": inProgress.length,
    Completed: completedEng.length,
    Payments: paymentItems.length,
  };

  return {
    counts,
    posted,
    offers,
    inProgress,
    completed: completedEng,
    payments,
  };
}
