import Link from "next/link";

import { DismissDrawerLink } from "../../../../components/dismiss-drawer-link";
import { createClient } from "../../../../lib/supabase/server";
import { loadActiveLinkedNearWallet } from "../../../../lib/near/load-linked-wallet";
import {
  profileHasPhotoForGating,
  resolveProfileDisplayUrl,
} from "../../../../lib/profiles/resolve-photo";
import { formatBudgetSmallestUnits } from "../../../../lib/requests/format-budget";
import { AcceptResponseForm } from "./accept-response-form";

type Row = {
  id: string;
  message: string | null;
  proposed_amount: number | string;
  status: string;
  created_at: string;
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
  /** Owner may accept pending offers when true */
  canAcceptOffers: boolean;
  variant?: "drawer" | "page";
};

export async function RequestResponsesOwnerList({
  requestId,
  assetDecimals,
  assetSymbol,
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

  const { data: inFlightIntent } = await supabase
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
  const inFlightResponseId = inFlightIntent?.response_id ?? null;
  const { data: preConvs } = await supabase
    .from("conversations")
    .select("id, response_id")
    .eq("request_id", requestId)
    .eq("kind", "pre_accept");
  const convByResponse = new Map(
    (preConvs ?? []).map((c) => [c.response_id, c.id] as const),
  );

  const { data: rows, error } = await supabase
    .from("request_responses")
    .select(
      `
      id,
      message,
      proposed_amount,
      status,
      created_at,
      provider_profiles (
        headline,
        profiles ( display_name, avatar_url, live_profile_photo_path )
      )
    `,
    )
    .eq("request_id", requestId)
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
    <ul className="flex flex-col gap-4">
      {withUrls.map((r) => {
        const amount = formatBudgetSmallestUnits(
          String(r.proposed_amount),
          assetDecimals,
        );
        const name = r.provider_profiles?.profiles?.display_name ?? "Provider";
        const showAccept = canAcceptOffers && r.status === "pending";

        return (
          <li
            key={r.id}
            className="flex gap-4 rounded-lg border border-stone-200 p-4 dark:border-stone-700"
          >
            {r.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- signed URL
              <img
                src={r.photoUrl}
                alt=""
                className="h-16 w-16 shrink-0 rounded-full object-cover"
              />
            ) : (
              <div
                className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-stone-200 text-xs text-stone-600 dark:bg-stone-800 dark:text-stone-400"
                aria-hidden
              >
                —
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="font-medium text-stone-900 dark:text-stone-100">
                {name}
              </p>
              {r.provider_profiles?.headline && (
                <p className="text-sm text-stone-600 dark:text-stone-400">
                  {r.provider_profiles.headline}
                </p>
              )}
              <p className="mt-1 font-mono text-sm text-stone-800 dark:text-stone-200">
                {amount} {assetSymbol} proposed
              </p>
              {r.message && (
                <p className="mt-2 whitespace-pre-wrap text-sm text-stone-700 dark:text-stone-300">
                  {r.message}
                </p>
              )}
              <p className="mt-2 text-xs text-stone-500">
                {new Date(r.created_at).toLocaleString()}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {showAccept && (
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
                  />
                )}
                {convByResponse.has(r.id) && (
                  <ChatLink
                    href={`/conversations/${convByResponse.get(r.id)}`}
                    className="text-sm font-medium text-stone-900 underline dark:text-stone-100"
                  >
                    Open chat
                  </ChatLink>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
