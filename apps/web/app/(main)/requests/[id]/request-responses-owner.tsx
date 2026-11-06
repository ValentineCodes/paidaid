import Link from "next/link";

import { LIVE_PROFILE_PHOTOS_BUCKET } from "../../../../lib/constants/storage";
import { createClient } from "../../../../lib/supabase/server";
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
};

export async function RequestResponsesOwnerList({
  requestId,
  assetDecimals,
  assetSymbol,
  canAcceptOffers,
}: Props) {
  const supabase = await createClient();
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
        profiles ( display_name, live_profile_photo_path )
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
      const path = r.provider_profiles?.profiles?.live_profile_photo_path;
      if (!path) {
        return { ...r, photoUrl: null as string | null };
      }
      const { data } = await supabase.storage
        .from(LIVE_PROFILE_PHOTOS_BUCKET)
        .createSignedUrl(path, 3600);
      return { ...r, photoUrl: data?.signedUrl ?? null };
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
                {r.provider_profiles?.headline ? (
                  <span className="ml-2 font-normal text-stone-600 dark:text-stone-400">
                    — {r.provider_profiles.headline}
                  </span>
                ) : null}
              </p>
              <p className="mt-1 text-xs capitalize text-stone-500">
                {r.status.replace(/_/g, " ")} ·{" "}
                {new Date(r.created_at).toLocaleString()}
              </p>
              <p className="mt-2 font-mono text-sm">
                {amount} {assetSymbol}
              </p>
              {r.message && (
                <p className="mt-2 whitespace-pre-wrap text-sm text-stone-700 dark:text-stone-300">
                  {r.message}
                </p>
              )}
              {convByResponse.get(r.id) && (
                <p className="mt-3">
                  <Link
                    href={`/conversations/${convByResponse.get(r.id)}`}
                    className="text-sm font-medium underline"
                  >
                    Open chat
                  </Link>
                </p>
              )}
              {showAccept ? (
                <AcceptResponseForm requestId={requestId} responseId={r.id} />
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
