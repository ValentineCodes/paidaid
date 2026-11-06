import Link from "next/link";
import { notFound } from "next/navigation";

import { createClient } from "../../../../lib/supabase/server";
import { isSupabaseConfigured } from "../../../../lib/supabase/env";
import { REQUEST_PHOTOS_BUCKET } from "../../../../lib/constants/storage";
import { formatBudgetSmallestUnits } from "../../../../lib/requests/format-budget";
import type { Json, Tables } from "../../../../lib/database.types";
import { RequestResponsesOwnerList } from "./request-responses-owner";
import { RespondSection } from "./respond-section";

type PageProps = { params: Promise<{ id: string }> };

type PublicTag = {
  id: string;
  slug: string;
  label: string;
  category: Tables<"tags">["category"];
};

function parseTags(raw: Json | undefined): PublicTag[] {
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

export default async function RequestDetailPage({ params }: PageProps) {
  const { id } = await params;

  if (!isSupabaseConfigured()) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <p className="text-stone-600 dark:text-stone-400">
          Supabase is not configured.
        </p>
      </main>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profileRow } = user
    ? await supabase
        .from("profiles")
        .select("live_profile_photo_path, live_profile_photo_captured_at")
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
    notFound();
  }

  const isOwner = !!ownRow;
  const row = ownRow;
  const pub = publicRow;

  const isPublicListing =
    pub != null || (row?.status === "open" && row.published_at != null);

  if (!isOwner && !isPublicListing) {
    notFound();
  }

  const title = row?.title ?? pub?.title ?? "Request";
  const description = row?.description ?? pub?.description ?? "";
  const status = row?.status ?? "open";
  const timingType = row?.timing_type ?? pub?.timing_type;
  const scheduledAt = row?.scheduled_at ?? pub?.scheduled_at;
  const deadlineAt = row?.deadline_at ?? pub?.deadline_at;
  const publishedAt = row?.published_at ?? pub?.published_at;
  const locationKind = row?.location_kind ?? pub?.location_kind;
  const locationLabel = row?.location_label ?? pub?.location_label;

  const tags =
    pub?.tags != null
      ? parseTags(pub.tags)
      : isOwner && row
        ? await loadTagsForOwner(supabase, id)
        : [];

  const budgetAmount = row?.budget_amount ?? pub?.budget_amount;
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

  const budgetAmountStr = budgetAmount != null ? String(budgetAmount) : "";

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

  const hasLiveProfilePhoto =
    profileRow?.live_profile_photo_path != null &&
    profileRow?.live_profile_photo_captured_at != null;

  let pendingResponseId: string | null = null;
  if (user && !isOwner && status === "open" && pub) {
    const { data: pp } = await supabase
      .from("provider_profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (pp) {
      const { data: pend } = await supabase
        .from("request_responses")
        .select("id")
        .eq("request_id", id)
        .eq("provider_profile_id", pp.id)
        .eq("status", "pending")
        .maybeSingle();
      pendingResponseId = pend?.id ?? null;
    }
  }

  const showRespond = user && !isOwner && status === "open" && isPublicListing;

  let preConversationId: string | null = null;
  if (user && !isOwner && status === "open" && pub && pendingResponseId) {
    const { data: preConv } = await supabase
      .from("conversations")
      .select("id")
      .eq("request_id", id)
      .eq("kind", "pre_accept")
      .eq("response_id", pendingResponseId)
      .maybeSingle();
    preConversationId = preConv?.id ?? null;
  }

  const canAcceptOffers =
    isOwner &&
    !!user &&
    status === "open" &&
    (!row?.expires_at || new Date(row.expires_at) > new Date());

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

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-12">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-stone-500">
            <Link href="/" className="underline">
              Marketplace
            </Link>
            {isOwner && (
              <>
                {" · "}
                <Link href="/requests/mine" className="underline">
                  My requests
                </Link>
              </>
            )}
            {isOwner && (
              <>
                {" · "}
                <Link href="/requests/new" className="underline">
                  New request
                </Link>
              </>
            )}
            {user && (
              <>
                {" · "}
                <Link href="/responses/mine" className="underline">
                  My responses
                </Link>
              </>
            )}
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            {title}
          </h1>
          <p className="mt-2 text-sm capitalize text-stone-500">
            Status: {String(status).replace(/_/g, " ")}
          </p>
        </div>
      </div>

      {isOwner && user && (
        <p
          className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-700 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200"
          role="status"
        >
          Your request was saved{publishedAt ? " and published" : " as a draft"}
          . This is an indicative budget only — nothing is funded or held in
          escrow.
        </p>
      )}

      {!user && (
        <p
          className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100"
          role="note"
        >
          Budget shown is indicative — not deposited or escrowed.{" "}
          <Link href="/auth/login" className="font-medium underline">
            Sign in
          </Link>{" "}
          to respond to requests or post your own.
        </p>
      )}

      {user && !isOwner && (
        <p
          className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100"
          role="note"
        >
          Budget shown is indicative — not deposited or escrowed.
        </p>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium text-stone-900 dark:text-stone-100">
          Description
        </h2>
        <p className="whitespace-pre-wrap text-stone-700 dark:text-stone-300">
          {description}
        </p>
      </section>

      {tags.length > 0 && (
        <section>
          <h2 className="text-lg font-medium text-stone-900 dark:text-stone-100">
            Tags
          </h2>
          <ul className="mt-2 flex flex-wrap gap-2">
            {tags.map((t) => (
              <li
                key={t.id}
                className="rounded-full bg-stone-100 px-3 py-1 text-sm dark:bg-stone-800"
              >
                {t.label}
              </li>
            ))}
          </ul>
        </section>
      )}

      <dl className="grid gap-3 text-sm">
        <div>
          <dt className="text-stone-500">Timing</dt>
          <dd className="capitalize">
            {timingType}
            {timingType === "scheduled" && scheduledAt
              ? ` — ${new Date(scheduledAt).toLocaleString()}`
              : null}
          </dd>
        </div>
        {deadlineAt && (
          <div>
            <dt className="text-stone-500">Expected completion by</dt>
            <dd>{new Date(deadlineAt).toLocaleString()}</dd>
          </div>
        )}
        <div>
          <dt className="text-stone-500">Location</dt>
          <dd>{locationLine}</dd>
        </div>
        {budgetAmount != null && (
          <div>
            <dt className="text-stone-500">Indicative budget</dt>
            <dd className="font-mono">
              {budgetHuman} {displaySymbol}
            </dd>
          </div>
        )}
        {publishedAt && (
          <div>
            <dt className="text-stone-500">Published</dt>
            <dd>{new Date(publishedAt).toLocaleString()}</dd>
          </div>
        )}
      </dl>

      {photoUrls.length > 0 && (
        <section>
          <h2 className="text-lg font-medium text-stone-900 dark:text-stone-100">
            Photos
          </h2>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {photoUrls.map((url, i) => (
              // eslint-disable-next-line @next/next/no-img-element -- signed or redirect URLs
              <img
                key={url + i}
                src={url}
                alt=""
                className="h-32 w-full rounded-lg object-cover"
              />
            ))}
          </div>
        </section>
      )}

      {isOwner && user && (
        <>
          {assignmentRow && engagementRow && (
            <section
              className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-900 dark:bg-emerald-950/40"
              aria-labelledby="assigned-heading"
            >
              <h2
                id="assigned-heading"
                className="text-sm font-medium text-emerald-950 dark:text-emerald-100"
              >
                This request is assigned
              </h2>
              <p className="mt-1 text-sm text-emerald-900 dark:text-emerald-200">
                Engagement is{" "}
                <span className="capitalize">{engagementRow.status}</span>.
                Scheduled day (UTC):{" "}
                <span className="font-mono">
                  {engagementRow.scheduled_for_day}
                </span>
                .
              </p>
              <p className="mt-2">
                <Link
                  href={`/engagements/${engagementRow.id}`}
                  className="text-sm font-medium underline"
                >
                  Open engagement overview
                </Link>
              </p>
            </section>
          )}
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-medium text-stone-900 dark:text-stone-100">
              Responses
            </h2>
            {!canAcceptOffers && status !== "open" && (
              <p className="text-sm text-stone-600 dark:text-stone-400">
                This request is not open for accepting new offers
                {status === "assigned"
                  ? " — you have already chosen a provider."
                  : "."}
              </p>
            )}
            {!canAcceptOffers &&
              status === "open" &&
              row?.expires_at != null &&
              new Date(row.expires_at) <= new Date() && (
                <p className="text-sm text-stone-600 dark:text-stone-400">
                  This request has expired — you cannot accept responses.
                </p>
              )}
            <RequestResponsesOwnerList
              requestId={id}
              assetDecimals={displayDecimals}
              assetSymbol={displaySymbol}
              canAcceptOffers={canAcceptOffers}
            />
          </section>
        </>
      )}

      {showRespond && budgetAmount != null && (
        <RespondSection
          requestId={id}
          budgetAmountSmallest={budgetAmountStr}
          assetSymbol={displaySymbol}
          assetDecimals={displayDecimals}
          hasLiveProfilePhoto={hasLiveProfilePhoto}
          pendingResponseId={pendingResponseId}
          preConversationId={preConversationId}
        />
      )}
    </main>
  );
}

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
