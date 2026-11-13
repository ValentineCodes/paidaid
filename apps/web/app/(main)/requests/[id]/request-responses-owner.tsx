import Link from "next/link";

import { DismissDrawerLink } from "../../../../components/dismiss-drawer-link";
import { FigmaIcon } from "../../../../components/figma-icons";
import { PreAcceptChatLink } from "../../../../components/pre-accept-chat-link";
import { resolvePreAcceptChatForViewer } from "../../../../lib/messages/pre-accept-chat-access";
import { createClient } from "../../../../lib/supabase/server";
import { loadActiveLinkedNearWallet } from "../../../../lib/near/load-linked-wallet";
import {
  profileHasPhotoForGating,
  resolveProfileDisplayUrl,
} from "../../../../lib/profiles/resolve-photo";
import { formatPostedRelative } from "../../../../lib/datetime/relative-from-now";
import {
  formatBudgetSmallestUnits,
  normalizeAssetDecimals,
} from "../../../../lib/requests/format-budget";
import { MilestoneScheduleDisplay } from "../../../../components/milestones/milestone-schedule-display";
import { loadResponseMilestoneProposals } from "../../../../lib/milestones/load-request-milestones";
import { milestoneOfferTermsReady } from "../../../../lib/milestones/milestone-schedule";
import type { MilestoneDisplayRow } from "../../../../lib/milestones/milestone-schedule";
import { loadInFlightAcceptanceResponseId } from "../acceptance-funding-actions";
import { AcceptResponseForm } from "./accept-response-form";
import { MilestoneReviewForm } from "./milestone-review-form";

type Row = {
  id: string;
  message: string | null;
  proposed_amount: string;
  status: string;
  created_at: string;
  milestone_offer_status: string | null;
  conversations?: { id: string; kind: string }[] | null;
  provider_profiles: {
    user_id: string;
    headline: string | null;
    profiles: {
      display_name: string;
      avatar_url: string | null;
      live_profile_photo_path: string | null;
    } | null;
  } | null;
};

type Props = {
  requestId: string;
  assetDecimals: number;
  assetSymbol: string;
  nowMs: number;
  /** Owner may accept pending offers when true */
  canAcceptOffers: boolean;
  paymentMode: "single" | "milestones";
  requestMilestones: MilestoneDisplayRow[];
  requestBudgetSmallest: string | null;
  variant?: "drawer" | "page";
};

function initialsFromDisplayName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase() || "?";
}

export async function RequestResponsesOwnerList({
  requestId,
  assetDecimals,
  assetSymbol,
  nowMs,
  canAcceptOffers,
  paymentMode,
  requestMilestones,
  requestBudgetSmallest,
  variant = "page",
}: Props) {
  const ChatLink = variant === "drawer" ? DismissDrawerLink : Link;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: requestMeta } = await supabase
    .from("requests")
    .select("requester_near_account_id")
    .eq("id", requestId)
    .maybeSingle();
  const sessionLinked =
    user != null
      ? (await loadActiveLinkedNearWallet(supabase, user.id))?.nearAccountId ??
        null
      : null;
  const linkedRequesterNear =
    requestMeta?.requester_near_account_id?.trim() || sessionLinked;

  const inFlight = await loadInFlightAcceptanceResponseId(requestId);
  const inFlightResponseId =
    inFlight.ok && inFlight.responseId ? inFlight.responseId : null;
  const { data: preConvs } = await supabase
    .from("conversations")
    .select("id, response_id")
    .eq("request_id", requestId)
    .eq("kind", "pre_accept");
  const convByResponse = new Map(
    (preConvs ?? [])
      .filter(
        (c): c is { id: string; response_id: string } =>
          c.response_id != null && c.response_id !== "",
      )
      .map((c) => [c.response_id, c.id] as const),
  );

  function preAcceptConversationId(row: Row): string | undefined {
    const embedded = row.conversations?.find((c) => c.kind === "pre_accept");
    if (embedded?.id) {
      return embedded.id;
    }
    return convByResponse.get(row.id);
  }

  const { data: rows, error } = await supabase
    .from("request_responses_api")
    .select(
      `
      id,
      message,
      proposed_amount,
      status,
      milestone_offer_status,
      created_at,
      conversations (
        id,
        kind
      ),
      provider_profiles (
        user_id,
        headline,
        profiles ( display_name, avatar_url, live_profile_photo_path )
      )
    `,
    )
    .eq("request_id", requestId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <p className="text-sm text-red-700 dark:text-red-300">{error.message}</p>
    );
  }

  const list = (rows ?? []) as unknown as Row[];

  if (list.length === 0) {
    return (
      <div className="request-responses-empty" role="status">
        <div className="request-responses-empty__icon" aria-hidden>
          <FigmaIcon name="message" size={20} />
        </div>
        <p className="request-responses-empty__title">No offers yet</p>
        <p className="request-responses-empty__lead">
          When providers respond, their offers show up here — compare messages,
          amounts, and accept the one that fits.
        </p>
      </div>
    );
  }

  const requesterId = user?.id ?? null;
  const chatUnreadByConv = new Map<string, boolean>();
  if (requesterId) {
    await Promise.all(
      list.map(async (r) => {
        const conversationId = preAcceptConversationId(r);
        const providerUserId = r.provider_profiles?.user_id;
        if (!conversationId || !providerUserId) {
          return;
        }
        const access = await resolvePreAcceptChatForViewer(supabase, {
          conversationId,
          viewerId: requesterId,
          requesterId,
          providerUserId,
        });
        if (access.showChatLink) {
          chatUnreadByConv.set(conversationId, access.hasUnread);
        }
      }),
    );
  }

  const withUrls = await Promise.all(
    list.map(async (r) => {
      const prof = r.provider_profiles?.profiles ?? null;
      const hasPhoto = profileHasPhotoForGating(prof);
      const photoUrl = hasPhoto
        ? await resolveProfileDisplayUrl(supabase, prof)
        : null;
      const proposalRows =
        r.milestone_offer_status === "proposal_pending" ||
        r.milestone_offer_status === "agreed"
          ? await loadResponseMilestoneProposals(supabase, r.id)
          : [];
      return { ...r, photoUrl, proposalRows };
    }),
  );

  return (
    <ul className="request-response-list">
      {withUrls.map((r) => {
        const amount = formatBudgetSmallestUnits(
          r.proposed_amount,
          normalizeAssetDecimals(assetDecimals),
        );
        const name = r.provider_profiles?.profiles?.display_name ?? "Provider";
        const termsReady = milestoneOfferTermsReady(
          paymentMode,
          r.milestone_offer_status,
        );
        const showAccept =
          canAcceptOffers && r.status === "pending" && termsReady;
        const showMilestoneReview =
          paymentMode === "milestones" &&
          r.milestone_offer_status === "proposal_pending" &&
          r.proposalRows.length > 0;
        const createdAt = new Date(r.created_at);
        const postedLabel = Number.isNaN(createdAt.getTime())
          ? "—"
          : formatPostedRelative(createdAt, nowMs);
        const conversationId = preAcceptConversationId(r);
        const providerHeadline = r.provider_profiles?.headline?.trim() ?? "";
        const showProviderHeadline = providerHeadline.length > 0;

        return (
          <li key={r.id} className="request-response-card">
            <div
              className={
                showProviderHeadline
                  ? "request-response-card__header"
                  : "request-response-card__header request-response-card__header--centered"
              }
            >
              <div
                className={
                  showProviderHeadline
                    ? "request-response-card__profile"
                    : "request-response-card__profile request-response-card__profile--centered"
                }
              >
                <div className="avatar large shrink-0">
                  {r.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- signed URL
                    <img
                      src={r.photoUrl}
                      alt=""
                      className="size-full rounded-full object-cover"
                    />
                  ) : (
                    initialsFromDisplayName(name)
                  )}
                </div>
                <div className="request-response-card__identity">
                  <p className="request-response-card__name">{name}</p>
                  {showProviderHeadline ? (
                    <p className="request-response-card__headline">
                      {providerHeadline}
                    </p>
                  ) : null}
                </div>
              </div>
              {conversationId ? (
                <PreAcceptChatLink
                  as={ChatLink}
                  href={`/messages/${conversationId}`}
                  hasUnread={chatUnreadByConv.get(conversationId) ?? false}
                  aria-label={
                    chatUnreadByConv.get(conversationId)
                      ? `Chat with ${name} (unread)`
                      : `Chat with ${name}`
                  }
                />
              ) : null}
            </div>
            <time
              dateTime={r.created_at}
              className="request-response-card__time"
            >
              {postedLabel}
            </time>

            <div className="request-response-card__offer">
              <small>Proposed offer</small>
              <strong>
                {amount} <span>{assetSymbol}</span>
              </strong>
            </div>

            {paymentMode === "milestones" ? (() => {
              const workerMilestoneRows =
                r.proposalRows.length > 0
                  ? r.proposalRows
                  : requestMilestones;
              if (workerMilestoneRows.length === 0) {
                return null;
              }
              return (
                <div className="mt-3 flex flex-col gap-3">
                  <MilestoneScheduleDisplay
                    rows={workerMilestoneRows}
                    assetSymbol={assetSymbol}
                    assetDecimals={normalizeAssetDecimals(assetDecimals)}
                    budgetSmallest={String(r.proposed_amount)}
                    compact
                  />
                </div>
              );
            })() : null}

            {r.message ? (
              <p className="request-response-card__message">{r.message}</p>
            ) : null}

            {showMilestoneReview ? (
              <MilestoneReviewForm requestId={requestId} responseId={r.id} />
            ) : null}

            {showAccept ? (
              <>
                <div
                  className="request-response-card__divider"
                  aria-hidden
                />
                <div className="request-response-card__actions">
                  <AcceptResponseForm
                    requestId={requestId}
                    responseId={r.id}
                    providerDisplayName={name}
                    offerAmountDisplay={amount}
                    assetSymbol={assetSymbol}
                    linkedRequesterNearAccountId={linkedRequesterNear}
                    anotherAcceptanceInProgress={
                      inFlightResponseId != null &&
                      inFlightResponseId !== r.id
                    }
                    variant={variant}
                  />
                </div>
              </>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
