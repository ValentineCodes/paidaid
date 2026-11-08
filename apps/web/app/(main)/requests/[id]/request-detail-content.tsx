import Link from "next/link";

import { DismissDrawerLink } from "../../../../components/dismiss-drawer-link";
import { RequestResponsesOwnerList } from "./request-responses-owner";
import { RespondSection } from "./respond-section";
import { PostedBySection } from "./posted-by-section";
import type { RequestDetailPageData } from "./request-detail-data";
import { categoryDotClassForLabel } from "../../../../lib/requests/category-dot";
import { formatPostedRelative } from "../../../../lib/datetime/relative-from-now";
import { FigmaIcon } from "../../../../components/figma-icons";

function formatDeadlineDrawerLabel(data: RequestDetailPageData): string {
  if (data.deadlineAt) {
    const d = new Date(data.deadlineAt);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    }
  }
  if (data.timingType === "scheduled" && data.scheduledAt) {
    const d = new Date(data.scheduledAt);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    }
  }
  if (data.timingType === "immediate") {
    return "Flexible";
  }
  return "—";
}

/** Figma drawer: `{place} · {type}` — no “In person — …” prefix on the place segment */
function drawerLocationLine(data: RequestDetailPageData): string {
  const { locationKind, locationLabel } = data;
  if (locationKind === "unspecified") {
    return "Not specified";
  }
  if (locationKind === "online") {
    return "Online";
  }
  const place = locationLabel?.trim();
  if (place) {
    return `${place} · In person`;
  }
  return "In person";
}

type Props = {
  data: RequestDetailPageData;
  variant: "page" | "drawer";
};

export function RequestDetailContent({ data, variant }: Props) {
  const {
    nowMs,
    id,
    user,
    isOwner,
    title,
    description,
    status,
    timingType,
    scheduledAt,
    deadlineAt,
    publishedAt,
    locationLine,
    tags,
    budgetAmount,
    budgetAmountStr,
    budgetHuman,
    displaySymbol,
    displayDecimals,
    photoUrls,
    hasProfilePhoto,
    pendingResponseId,
    preConversationId,
    showRespond,
    canAcceptOffers,
    assignmentRow,
    engagementRow,
    listingExpired,
    requesterPreview,
  } = data;

  const primaryTag = tags[0];
  const categoryLabel = primaryTag?.label ?? "Open";
  const dotClass = categoryDotClassForLabel(categoryLabel);
  const postedLabel = publishedAt
    ? formatPostedRelative(new Date(publishedAt), nowMs)
    : "—";

  const drawerPlaceLine = drawerLocationLine(data);

  if (variant === "drawer") {
    return (
      <>
        <div className="card-top">
          <span className={`category-dot ${dotClass}`} />
          <span>{categoryLabel}</span>
          <span className="posted">{postedLabel}</span>
        </div>
        <h2>{title}</h2>
        {photoUrls[0] ? (
          <div className="mb-5 overflow-hidden rounded-[12px] border border-[var(--line)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photoUrls[0]}
              alt=""
              className="max-h-[220px] w-full object-cover"
            />
          </div>
        ) : null}
        {budgetAmount != null && (
          <div className="detail-budget">
            {budgetHuman} {displaySymbol}
          </div>
        )}
        <div className="detail-meta">
          <div>
            <span className="text-[var(--muted)]" aria-hidden>
              <FigmaIcon name="pin" size={20} />
            </span>
            <span>
              <small>LOCATION</small>
              {drawerPlaceLine}
            </span>
          </div>
          <div>
            <span className="text-[var(--muted)]" aria-hidden>
              <FigmaIcon name="clock" size={20} />
            </span>
            <span>
              <small>DEADLINE</small>
              {formatDeadlineDrawerLabel(data)}
            </span>
          </div>
        </div>
        {description.trim() !== "" ? (
          <div className="detail-section">
            <h4>About this task</h4>
            <p className="whitespace-pre-wrap">{description}</p>
          </div>
        ) : null}
        {photoUrls.length > 1 && (
          <div className="detail-section">
            <h4>Photos</h4>
            <div className="grid grid-cols-2 gap-2">
              {photoUrls.slice(1).map((url, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={url + i}
                  src={url}
                  alt=""
                  className="h-28 w-full rounded-lg object-cover"
                />
              ))}
            </div>
          </div>
        )}
        {requesterPreview ? (
          <PostedBySection
            displayName={requesterPreview.displayName}
            verified={requesterPreview.verified}
            avatarUrl={requesterPreview.avatarUrl}
            variant="drawer"
          />
        ) : null}
        {isOwner && user && (
          <>
            {assignmentRow && engagementRow && (
              <section
                className="detail-section rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-900 dark:bg-emerald-950/40"
                aria-labelledby="assigned-heading-drawer"
              >
                <h4 id="assigned-heading-drawer">Assignment</h4>
                <p className="text-sm text-emerald-900 dark:text-emerald-200">
                  Engagement is{" "}
                  <span className="capitalize">{engagementRow.status}</span>.
                  Scheduled day (UTC):{" "}
                  <span className="font-mono">
                    {engagementRow.scheduled_for_day}
                  </span>
                  .
                </p>
                <p className="mt-2">
                  <DismissDrawerLink
                    href={`/engagements/${engagementRow.id}`}
                    className="text-sm font-medium underline"
                  >
                    Open engagement overview
                  </DismissDrawerLink>
                </p>
              </section>
            )}
            <section className="detail-section flex flex-col gap-3">
              <h4>Responses</h4>
              {!canAcceptOffers && status !== "open" && (
                <p className="text-sm text-[var(--muted)]">
                  This request is not open for accepting new offers
                  {status === "assigned"
                    ? " — you have already chosen a provider."
                    : "."}
                </p>
              )}
              {!canAcceptOffers && status === "open" && listingExpired && (
                  <p className="text-sm text-[var(--muted)]">
                    This request has expired — you cannot accept responses.
                  </p>
                )}
              <RequestResponsesOwnerList
                requestId={id}
                assetDecimals={displayDecimals}
                assetSymbol={displaySymbol}
                nowMs={nowMs}
                canAcceptOffers={canAcceptOffers}
                variant="drawer"
              />
            </section>
          </>
        )}
        {showRespond && budgetAmount != null && (
          <div className="pt-2">
            <RespondSection
              requestId={id}
              budgetAmountSmallest={budgetAmountStr}
              assetSymbol={displaySymbol}
              assetDecimals={displayDecimals}
              hasProfilePhoto={hasProfilePhoto}
              pendingResponseId={pendingResponseId}
              preConversationId={preConversationId}
            />
          </div>
        )}
        {!user && (
          <div className="detail-section">
            <DismissDrawerLink href="/auth/wallet" className="primary-wide">
              Sign in to respond
            </DismissDrawerLink>
          </div>
        )}
      </>
    );
  }

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
          Your request was saved{publishedAt ? " and published" : " as a draft"}.
        </p>
      )}

      {!user && (
        <p
          className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100"
          role="note"
        >
          <Link href="/auth/wallet" className="font-medium underline">
            Sign in
          </Link>{" "}
          to respond to requests or post your own.
        </p>
      )}

      {description.trim() !== "" ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-medium text-stone-900 dark:text-stone-100">
            Description
          </h2>
          <p className="whitespace-pre-wrap text-stone-700 dark:text-stone-300">
            {description}
          </p>
        </section>
      ) : null}

      {requesterPreview ? (
        <PostedBySection
          displayName={requesterPreview.displayName}
          verified={requesterPreview.verified}
          avatarUrl={requesterPreview.avatarUrl}
          variant="page"
        />
      ) : null}

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
            <dt className="text-stone-500">Budget</dt>
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
              // eslint-disable-next-line @next/next/no-img-element -- signed or proxy URLs
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
              listingExpired && (
                <p className="text-sm text-stone-600 dark:text-stone-400">
                  This request has expired — you cannot accept responses.
                </p>
              )}
            <RequestResponsesOwnerList
              requestId={id}
              assetDecimals={displayDecimals}
              assetSymbol={displaySymbol}
              nowMs={nowMs}
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
          hasProfilePhoto={hasProfilePhoto}
          pendingResponseId={pendingResponseId}
          preConversationId={preConversationId}
        />
      )}
    </main>
  );
}
