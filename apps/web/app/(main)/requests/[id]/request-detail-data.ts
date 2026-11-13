import { notFound } from "next/navigation";

import { resolvePreAcceptChatForViewer } from "../../../../lib/messages/pre-accept-chat-access";
import { profileHasUsablePhoto } from "../../../../lib/profiles/photo";
import { resolveProfileDisplayUrl } from "../../../../lib/profiles/resolve-photo";
import { createClient } from "../../../../lib/supabase/server";
import { REQUEST_PHOTOS_BUCKET } from "../../../../lib/constants/storage";
import { formatBudgetSmallestUnits } from "../../../../lib/requests/format-budget";
import {
  loadRequestMilestoneDisplayRows,
  loadResponseMilestoneProposals,
} from "../../../../lib/milestones/load-request-milestones";
import type { MilestoneDisplayRow } from "../../../../lib/milestones/milestone-schedule";
import type { Json, Tables } from "../../../../lib/database.types";

export type PublicTag = {
  id: string;
  slug: string;
  label: string;
  category: Tables<"tags">["category"];
};

export function parseTags(raw: Json | undefined): PublicTag[] {
  if (!raw || !Array.isArray(raw)) {
    return [];
  }
  return raw.filter(
    (t): t is PublicTag =>
      typeof t === "object" &&
      t !== null &&
      "id" in t &&
      "label" in t &&
      typeof (t as PublicTag).id === "string",
  );
}

function parsePhotoPaths(raw: Json | undefined): string[] {
  if (!raw || !Array.isArray(raw)) {
    return [];
  }
  return raw.filter((p): p is string => typeof p === "string");
}

export type PreAcceptChatLinkState = {
  conversationId: string;
  hasUnread: boolean;
};

export type ProviderPendingResponse = {
  id: string;
  message: string | null;
  proposedAmountSmallest: string;
  createdAt: string;
  headline: string | null;
  milestoneOfferStatus: string | null;
  /** Milestones shown on your pending offer (your proposal or requester plan you accepted). */
  milestoneRows: MilestoneDisplayRow[];
};

export type RequestDetailPageData = {
  /** Wall time (ms) for relative labels — from the route after `connection()`. */
  nowMs: number;
  id: string;
  user: { id: string } | null;
  isOwner: boolean;
  title: string;
  description: string;
  status: string;
  timingType: Tables<"requests">["timing_type"];
  scheduledAt: string | null;
  deadlineAt: string | null;
  publishedAt: string | null;
  locationKind: Tables<"requests">["location_kind"];
  locationLabel: string | null;
  locationLine: string;
  tags: PublicTag[];
  budgetAmount: string | number | null;
  budgetAmountStr: string;
  budgetHuman: string;
  displaySymbol: string;
  displayDecimals: number;
  photoUrls: string[];
  pendingResponse: ProviderPendingResponse | null;
  preAcceptChat: PreAcceptChatLinkState | null;
  showRespond: boolean;
  canAcceptOffers: boolean;
  assignmentRow: {
    id: string;
    accepted_response_id: string | null;
    provider_user_id: string | null;
  } | null;
  engagementRow: {
    id: string;
    status: string;
    scheduled_for_day: string;
  } | null;
  /** Listing expiry (owner row only; null if unknown) */
  expiresAt: string | null;
  /** True when the listing period has ended (uses request-time `nowMs`). */
  listingExpired: boolean;
  /** Display card for "Posted by" section */
  requesterPreview: {
    displayName: string;
    verified: boolean;
    avatarUrl: string | null;
  } | null;
  paymentMode: Tables<"requests">["payment_mode"];
  requestMilestones: MilestoneDisplayRow[];
};

async function loadTagsForOwner(
  supabase: Awaited<ReturnType<typeof createClient>>,
  requestId: string,
): Promise<PublicTag[]> {
  const { data: rt } = await supabase
    .from("request_tags")
    .select("tag_id")
    .eq("request_id", requestId);
  const ids = rt?.map((r) => r.tag_id) ?? [];
  if (!ids.length) {
    return [];
  }
  const { data: tagRows } = await supabase
    .from("tags")
    .select("id, slug, label, category")
    .in("id", ids);
  return (tagRows ?? []) as PublicTag[];
}

export async function loadRequestDetailPageData(
  id: string,
  nowMs: number,
): Promise<RequestDetailPageData | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profileRow } = user
    ? await supabase
        .from("profiles")
        .select(
          "display_name, avatar_url, live_profile_photo_path, live_profile_photo_captured_at",
        )
        .eq("id", user.id)
        .maybeSingle()
    : { data: null };

  const { data: ownRow } = user
    ? await supabase
        .from("requests")
        .select("*")
        .eq("id", id)
        .eq("requester_id", user.id)
        .maybeSingle()
    : { data: null };

  const { data: publicRow } = await supabase
    .from("requests_public")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!ownRow && !publicRow) {
    return null;
  }

  const isOwner = !!ownRow;
  const row = ownRow;
  const pub = publicRow;

  const isPublicListing =
    pub != null || (row?.status === "open" && row.published_at != null);

  if (!isOwner && !isPublicListing) {
    return null;
  }

  const title = row?.title ?? pub?.title ?? "Request";
  const description = row?.description ?? pub?.description ?? "";
  const status = row?.status ?? "open";
  const timingType = (row?.timing_type ??
    pub?.timing_type ??
    "immediate") as Tables<"requests">["timing_type"];
  const scheduledAt = row?.scheduled_at ?? pub?.scheduled_at ?? null;
  const deadlineAt = row?.deadline_at ?? pub?.deadline_at ?? null;
  const publishedAt = row?.published_at ?? pub?.published_at ?? null;
  const locationKind = (row?.location_kind ??
    pub?.location_kind ??
    "unspecified") as Tables<"requests">["location_kind"];
  const locationLabel = row?.location_label ?? pub?.location_label ?? null;

  const tags =
    pub?.tags != null
      ? parseTags(pub.tags)
      : isOwner && row
        ? await loadTagsForOwner(supabase, id)
        : [];

  const budgetAmount = pub?.budget_amount ?? row?.budget_amount ?? null;
  const budgetAssetId = row?.budget_asset_id ?? pub?.budget_asset_id;
  const assetSymbol = pub?.asset_symbol;
  const assetDecimals = pub?.asset_decimals;

  let displaySymbol = assetSymbol ?? "";
  let displayDecimals = assetDecimals ?? 24;
  if (!pub && budgetAssetId) {
    const { data: asset } = await supabase
      .from("assets")
      .select("symbol, decimals")
      .eq("id", budgetAssetId)
      .maybeSingle();
    if (asset) {
      displaySymbol = asset.symbol;
      displayDecimals = asset.decimals;
    }
  }

  const budgetHuman =
    budgetAmount != null
      ? formatBudgetSmallestUnits(budgetAmount, displayDecimals)
      : "";

  const budgetAmountStr =
    budgetAmount != null
      ? typeof budgetAmount === "string"
        ? budgetAmount
        : String(budgetAmount)
      : "";

  const paymentMode =
    (row?.payment_mode ??
      pub?.payment_mode ??
      "single") as Tables<"requests">["payment_mode"];

  const requestMilestones =
    paymentMode === "milestones"
      ? await loadRequestMilestoneDisplayRows(supabase, id)
      : [];

  let photoUrls: string[] = [];
  if (isOwner && user && row) {
    const { data: photos } = await supabase
      .from("request_photos")
      .select("storage_path")
      .eq("request_id", id)
      .order("sort_order");
    if (photos?.length) {
      const signed = await Promise.all(
        photos.map(async (p) => {
          const { data } = await supabase.storage
            .from(REQUEST_PHOTOS_BUCKET)
            .createSignedUrl(p.storage_path, 3600);
          return data?.signedUrl ?? null;
        }),
      );
      photoUrls = signed.filter(Boolean) as string[];
    }
  } else if (pub?.photo_paths) {
    const paths = parsePhotoPaths(pub.photo_paths);
    photoUrls = paths.map(
      (path) => `/api/request-photo?path=${encodeURIComponent(path)}`,
    );
  }

  const locationLine =
    locationKind === "unspecified"
      ? "Not specified"
      : locationKind === "online"
        ? "Online"
        : locationLabel
          ? `In person — ${locationLabel}`
          : "In person";

  let pendingResponse: ProviderPendingResponse | null = null;
  if (user && !isOwner && status === "open" && pub) {
    const { data: pp } = await supabase
      .from("provider_profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (pp) {
      const { data: pend } = await supabase
        .from("request_responses")
        .select(
          "id, message, proposed_amount, created_at, milestone_offer_status, provider_profiles ( headline )",
        )
        .eq("request_id", id)
        .eq("provider_profile_id", pp.id)
        .eq("status", "pending")
        .maybeSingle();
      if (pend) {
        const ppJoin = pend.provider_profiles as
          { headline: string | null } | { headline: string | null }[] | null;
        const headline =
          (Array.isArray(ppJoin) ? ppJoin[0]?.headline : ppJoin?.headline) ??
          null;

        let milestoneRows: MilestoneDisplayRow[] = [];
        if (paymentMode === "milestones") {
          if (pend.milestone_offer_status === "proposal_pending") {
            milestoneRows = await loadResponseMilestoneProposals(
              supabase,
              pend.id,
            );
          } else if (pend.milestone_offer_status === "accepted_as_proposed") {
            milestoneRows = requestMilestones;
          }
        }

        pendingResponse = {
          id: pend.id,
          message: pend.message?.trim() ? pend.message.trim() : null,
          proposedAmountSmallest: String(pend.proposed_amount),
          createdAt: pend.created_at,
          headline: headline?.trim() ? headline.trim() : null,
          milestoneOfferStatus: pend.milestone_offer_status ?? null,
          milestoneRows,
        };
      }
    }
  }

  const showRespond = !!(
    user &&
    !isOwner &&
    status === "open" &&
    isPublicListing
  );

  let preAcceptChat: PreAcceptChatLinkState | null = null;
  if (user && !isOwner && status === "open" && pub && pendingResponse) {
    const { data: reqMeta } = await supabase
      .from("requests")
      .select("requester_id")
      .eq("id", id)
      .maybeSingle();
    const { data: preConv } = await supabase
      .from("conversations")
      .select("id")
      .eq("request_id", id)
      .eq("kind", "pre_accept")
      .eq("response_id", pendingResponse.id)
      .maybeSingle();
    if (preConv?.id && reqMeta?.requester_id) {
      const access = await resolvePreAcceptChatForViewer(supabase, {
        conversationId: preConv.id,
        viewerId: user.id,
        requesterId: reqMeta.requester_id,
        providerUserId: user.id,
      });
      if (access.showChatLink) {
        preAcceptChat = {
          conversationId: preConv.id,
          hasUnread: access.hasUnread,
        };
      }
    }
  }

  const expiresAt = row?.expires_at ?? null;
  const canAcceptOffers =
    isOwner &&
    !!user &&
    status === "open" &&
    (!expiresAt || new Date(expiresAt).getTime() > nowMs);

  const listingExpired =
    status === "open" &&
    expiresAt != null &&
    new Date(expiresAt).getTime() <= nowMs;

  const { data: assignmentRow } =
    isOwner && user
      ? await supabase
          .from("assignments")
          .select("id, accepted_response_id, provider_user_id")
          .eq("request_id", id)
          .maybeSingle()
      : { data: null };

  const { data: engagementRow } = assignmentRow?.id
    ? await supabase
        .from("engagements")
        .select("id, status, scheduled_for_day")
        .eq("assignment_id", assignmentRow.id)
        .maybeSingle()
    : { data: null };

  let requesterPreview: RequestDetailPageData["requesterPreview"] = null;
  if (isOwner && user && profileRow) {
    const verified = profileHasUsablePhoto(profileRow);
    const avatarUrl = await resolveProfileDisplayUrl(supabase, profileRow);
    requesterPreview = {
      displayName: profileRow.display_name.trim() || "Member",
      verified,
      avatarUrl,
    };
  } else if (pub) {
    const { data: cardRows } = await supabase.rpc(
      "request_requester_public_card",
      {
        p_request_id: id,
      },
    );
    const card = Array.isArray(cardRows) ? cardRows[0] : cardRows;
    if (
      card &&
      typeof card === "object" &&
      "display_name" in card &&
      typeof (card as { display_name: unknown }).display_name === "string"
    ) {
      const verified = Boolean((card as { verified?: unknown }).verified);
      const row = card as {
        display_name: string;
        avatar_url?: string | null;
        live_profile_photo_path?: string | null;
      };
      const avatarUrl = await resolveProfileDisplayUrl(supabase, {
        avatar_url: row.avatar_url ?? null,
        live_profile_photo_path: row.live_profile_photo_path ?? null,
      });
      requesterPreview = {
        displayName: row.display_name.trim() || "Member",
        verified,
        avatarUrl,
      };
    }
  }

  return {
    nowMs,
    id,
    user: user ? { id: user.id } : null,
    isOwner,
    expiresAt,
    listingExpired,
    title,
    description,
    status,
    timingType,
    scheduledAt,
    deadlineAt,
    publishedAt,
    locationKind,
    locationLabel,
    locationLine,
    tags,
    budgetAmount,
    budgetAmountStr,
    budgetHuman,
    displaySymbol,
    displayDecimals,
    photoUrls,
    pendingResponse,
    preAcceptChat,
    showRespond,
    canAcceptOffers,
    assignmentRow,
    engagementRow,
    requesterPreview,
    paymentMode,
    requestMilestones,
  };
}

export async function getRequestDetailOrNotFound(id: string, nowMs: number) {
  const data = await loadRequestDetailPageData(id, nowMs);
  if (!data) {
    notFound();
  }
  return data;
}
