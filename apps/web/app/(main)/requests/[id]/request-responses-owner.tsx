import Link from "next/link";

import { DismissDrawerLink } from "../../../../components/dismiss-drawer-link";
import { FigmaIcon } from "../../../../components/figma-icons";
import { createClient } from "../../../../lib/supabase/server";
import { loadActiveLinkedNearWallet } from "../../../../lib/near/load-linked-wallet";
import {
  profileHasPhotoForGating,
  resolveProfileDisplayUrl,
} from "../../../../lib/profiles/resolve-photo";
import { formatPostedRelative } from "../../../../lib/datetime/relative-from-now";
import { formatBudgetSmallestUnits } from "../../../../lib/requests/format-budget";
import { loadInFlightAcceptanceResponseId } from "../acceptance-funding-actions";
import { AcceptResponseForm } from "./accept-response-form";

type Row = {
  id: string;
  message: string | null;
  proposed_amount: number | string;
  status: string;
  created_at: string;
  conversations?: { id: string; kind: string }[] | null;
  provider_profiles: {
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
    .from("request_responses")
    .select(
      `
      id,
      message,
      proposed_amount,
      status,
      created_at,
      conversations (
        id,
        kind
      ),
      provider_profiles (
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
      <p className="text-sm text-stone-600 dark:text-stone-400">
        No responses yet.
      </p>
    );
  }

  const withUrls = await Promise.all(
    list.map(async (r) => {
      const prof = r.provider_profiles?.profiles ?? null;
      const hasPhoto = profileHasPhotoForGating(prof);
      const photoUrl = hasPhoto
        ? await resolveProfileDisplayUrl(supabase, prof)
        : null;
      return { ...r, photoUrl };
    }),
  );

  return (
    <ul className="request-response-list">
      {withUrls.map((r) => {
        const amount = formatBudgetSmallestUnits(
          String(r.proposed_amount),
          assetDecimals,
        );
        const name = r.provider_profiles?.profiles?.display_name ?? "Provider";
        const showAccept = canAcceptOffers && r.status === "pending";
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
                <ChatLink
                  href={`/messages/${conversationId}`}
                  className="engagement-person-card__chat"
                  aria-label={`Chat with ${name}`}
                >
                  <span className="engagement-connect-icon" aria-hidden>
                    <FigmaIcon name="message" size={20} />
                  </span>
                </ChatLink>
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

            {r.message ? (
              <p className="request-response-card__message">{r.message}</p>
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
