import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { createClient } from "../../../../lib/supabase/server";
import { isSupabaseConfigured } from "../../../../lib/supabase/env";
import { LIVE_PROFILE_PHOTOS_BUCKET } from "../../../../lib/constants/storage";
import { formatBudgetSmallestUnits } from "../../../../lib/requests/format-budget";
import { EngagementWorkflow } from "./engagement-workflow";
import type { Database } from "../../../../lib/database.types";

type DeliveryAttachmentRow =
  Database["public"]["Tables"]["delivery_attachments"]["Row"];

type PageProps = { params: Promise<{ id: string }> };

export default async function EngagementPage({ params }: PageProps) {
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

  if (!user) {
    redirect(`/auth/login?next=/engagements/${id}`);
  }

  const { data: engagement, error: eErr } = await supabase
    .from("engagements")
    .select(
      `
      id,
      status,
      scheduled_for_day,
      created_at,
      auto_complete_deadline_at,
      auto_completed_at,
      completed_at,
      assignments (
        request_id,
        accepted_response_id,
        requester_id,
        provider_user_id
      )
    `,
    )
    .eq("id", id)
    .maybeSingle();

  if (eErr || !engagement) {
    notFound();
  }

  const assignment = engagement.assignments as {
    request_id: string;
    accepted_response_id: string;
    requester_id: string;
    provider_user_id: string;
  } | null;

  if (
    !assignment ||
    (assignment.requester_id !== user.id &&
      assignment.provider_user_id !== user.id)
  ) {
    notFound();
  }

  const isProvider = assignment.provider_user_id === user.id;
  const peerId = isProvider
    ? assignment.requester_id
    : assignment.provider_user_id;

  const { data: requestRow } = await supabase
    .from("requests")
    .select(
      "title, description, budget_amount, budget_asset_id, location_kind, location_label, timing_type, scheduled_at, deadline_at, expires_at, published_at",
    )
    .eq("id", assignment.request_id)
    .maybeSingle();

  const { data: accepted } = await supabase
    .from("request_responses")
    .select(
      `
      proposed_amount,
      proposed_asset_id,
      assets!request_responses_proposed_asset_id_fkey ( symbol, decimals )
    `,
    )
    .eq("id", assignment.accepted_response_id)
    .maybeSingle();

  const asset = accepted?.assets as {
    symbol: string;
    decimals: number;
  } | null;

  const { data: peerProfile } = await supabase
    .from("profiles")
    .select("display_name, live_profile_photo_path")
    .eq("id", peerId)
    .maybeSingle();

  let peerPhotoUrl: string | null = null;
  if (peerProfile?.live_profile_photo_path) {
    const { data } = await supabase.storage
      .from(LIVE_PROFILE_PHOTOS_BUCKET)
      .createSignedUrl(peerProfile.live_profile_photo_path, 3600);
    peerPhotoUrl = data?.signedUrl ?? null;
  }

  let peerPhone: string | null = null;
  const { data: canRead } = await supabase.rpc("can_read_private_contact", {
    p_target_user: peerId,
  });
  if (canRead === true) {
    const { data: pc } = await supabase
      .from("profile_private_contact")
      .select("phone")
      .eq("user_id", peerId)
      .maybeSingle();
    peerPhone = pc?.phone ?? null;
  }

  const { data: conv } = await supabase
    .from("conversations")
    .select("id")
    .eq("engagement_id", id)
    .eq("kind", "engagement")
    .maybeSingle();

  const { data: delivery } = await supabase
    .from("deliveries")
    .select("*")
    .eq("engagement_id", id)
    .maybeSingle();

  let deliveryAttachments: DeliveryAttachmentRow[] = [];

  if (delivery) {
    const { data: att } = await supabase
      .from("delivery_attachments")
      .select("*")
      .eq("delivery_id", delivery.id)
      .order("sort_order", { ascending: true });
    deliveryAttachments = att ?? [];
  }

  const { data: issueRows } = await supabase
    .from("engagement_issues")
    .select("*")
    .eq("engagement_id", id)
    .order("created_at", { ascending: false });

  const { data: reviewRow } = await supabase
    .from("reviews")
    .select("*")
    .eq("engagement_id", id)
    .maybeSingle();

  const { data: myProfile } = await supabase
    .from("profiles")
    .select("live_profile_photo_path, live_profile_photo_captured_at")
    .eq("id", user.id)
    .maybeSingle();

  const hasLivePhoto = Boolean(
    myProfile?.live_profile_photo_path &&
    myProfile?.live_profile_photo_captured_at,
  );

  const budgetStr =
    accepted && asset
      ? formatBudgetSmallestUnits(
          String(accepted.proposed_amount),
          asset.decimals,
        )
      : "";

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-12">
      <p className="text-sm text-stone-500">
        <Link href="/responses/mine" className="underline">
          My responses
        </Link>
        {" · "}
        <Link href="/requests/mine" className="underline">
          My requests
        </Link>
      </p>

      <h1 className="text-3xl font-semibold tracking-tight">
        {requestRow?.title ?? "Engagement"}
      </h1>

      <p className="text-sm capitalize text-stone-600 dark:text-stone-400">
        Status: {engagement.status}
      </p>

      <section className="rounded-lg border border-stone-200 p-4 dark:border-stone-800">
        <h2 className="text-sm font-medium text-stone-900 dark:text-stone-100">
          {isProvider ? "Requester" : "Provider"}
        </h2>
        <div className="mt-2 flex gap-3">
          {peerPhotoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={peerPhotoUrl}
              alt=""
              className="h-14 w-14 rounded-full object-cover"
            />
          ) : (
            <div
              className="flex h-14 w-14 items-center justify-center rounded-full bg-stone-200 text-xs dark:bg-stone-800"
              aria-hidden
            >
              —
            </div>
          )}
          <div>
            <p className="font-medium">{peerProfile?.display_name ?? "User"}</p>
            {peerPhone && (
              <p className="text-sm">
                <a href={`tel:${peerPhone}`} className="underline">
                  {peerPhone}
                </a>
              </p>
            )}
            {!peerPhone && (
              <p className="text-xs text-stone-500">
                Phone appears here when your partner adds one under Account.
              </p>
            )}
          </div>
        </div>
      </section>

      <dl className="grid gap-3 text-sm">
        <div>
          <dt className="text-stone-500">Agreed offer</dt>
          <dd className="font-mono">
            {budgetStr} {asset?.symbol ?? ""}
            <span className="ml-1 font-sans text-xs text-stone-500">
              (indicative)
            </span>
          </dd>
        </div>
        <div>
          <dt className="text-stone-500">Scheduled day (UTC)</dt>
          <dd className="font-mono">{engagement.scheduled_for_day}</dd>
        </div>
        {requestRow?.timing_type && (
          <div>
            <dt className="text-stone-500">Timing</dt>
            <dd className="capitalize">
              {requestRow.timing_type}
              {requestRow.timing_type === "scheduled" && requestRow.scheduled_at
                ? ` — ${new Date(requestRow.scheduled_at).toLocaleString()}`
                : null}
            </dd>
          </div>
        )}
        {requestRow?.deadline_at && (
          <div>
            <dt className="text-stone-500">Expected completion</dt>
            <dd>{new Date(requestRow.deadline_at).toLocaleString()}</dd>
          </div>
        )}
        <div>
          <dt className="text-stone-500">Task location</dt>
          <dd>
            {requestRow?.location_kind === "unspecified" && "Not specified"}
            {requestRow?.location_kind === "online" && "Online"}
            {requestRow?.location_kind === "in_person" &&
              (requestRow.location_label
                ? `${requestRow.location_label} · `
                : "")}
            {requestRow?.location_kind === "in_person" &&
              requestRow.location_label && (
                <a
                  href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(requestRow.location_label)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  Search map
                </a>
              )}
          </dd>
        </div>
      </dl>

      {requestRow?.description && (
        <section>
          <h2 className="text-lg font-medium text-stone-900 dark:text-stone-100">
            Description
          </h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-stone-700 dark:text-stone-300">
            {requestRow.description}
          </p>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium text-stone-900 dark:text-stone-100">
          Chat
        </h2>
        {conv?.id ? (
          <Link
            href={`/conversations/${conv.id}`}
            className="w-fit rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white dark:bg-stone-100 dark:text-stone-900"
          >
            Open conversation
          </Link>
        ) : (
          <p className="text-sm text-stone-500">No conversation linked yet.</p>
        )}
      </section>

      <EngagementWorkflow
        engagementId={id}
        conversationId={conv?.id ?? null}
        isProvider={isProvider}
        isRequester={!isProvider}
        engagementStatus={engagement.status}
        autoCompleteDeadlineAt={engagement.auto_complete_deadline_at}
        autoCompletedAt={engagement.auto_completed_at}
        completedAt={engagement.completed_at}
        delivery={delivery}
        deliveryAttachments={deliveryAttachments}
        issues={issueRows ?? []}
        existingReview={reviewRow}
        hasLivePhoto={hasLivePhoto}
      />
    </main>
  );
}
