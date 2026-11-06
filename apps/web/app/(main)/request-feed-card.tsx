import Link from "next/link";

import { formatBudgetSmallestUnits } from "../../lib/requests/format-budget";
import type { Tables } from "../../lib/database.types";

export type FeedCardRow = {
  id: string;
  title: string;
  description_preview: string | null;
  timing_type: Tables<"requests">["timing_type"];
  budget_amount: string | number;
  asset_symbol: string;
  asset_decimals: number;
  location_kind: Tables<"requests">["location_kind"];
  location_label: string | null;
  published_at: string | null;
  tags: unknown;
  first_photo_path: string | null;
};

type PublicTag = {
  id: string;
  label: string;
};

function parseTags(raw: unknown): PublicTag[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter(
    (t): t is PublicTag =>
      typeof t === "object" &&
      t !== null &&
      "id" in t &&
      "label" in t &&
      typeof (t as PublicTag).id === "string" &&
      typeof (t as PublicTag).label === "string",
  );
}

export function RequestFeedCard({ row }: { row: FeedCardRow }) {
  const tags = parseTags(row.tags);
  const budgetHuman = formatBudgetSmallestUnits(
    row.budget_amount,
    row.asset_decimals,
  );
  const loc =
    row.location_kind === "unspecified"
      ? null
      : row.location_kind === "online"
        ? "Online"
        : row.location_label
          ? `In person — ${row.location_label}`
          : "In person";
  const imgSrc = row.first_photo_path
    ? `/api/request-photo?path=${encodeURIComponent(row.first_photo_path)}`
    : null;

  return (
    <article className="overflow-hidden rounded-xl border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-950">
      <Link href={`/requests/${row.id}`} className="flex flex-col sm:flex-row">
        {imgSrc ? (
          <div className="relative h-44 w-full shrink-0 bg-stone-100 sm:h-auto sm:w-48 dark:bg-stone-900">
            {/* eslint-disable-next-line @next/next/no-img-element -- redirect to signed Supabase URL */}
            <img src={imgSrc} alt="" className="h-full w-full object-cover" />
          </div>
        ) : null}
        <div className="flex min-w-0 flex-1 flex-col gap-2 p-4">
          <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">
            {row.title}
          </h2>
          {row.description_preview ? (
            <p className="line-clamp-3 text-sm text-stone-600 dark:text-stone-400">
              {row.description_preview}
              {row.description_preview.length >= 280 ? "…" : ""}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-mono font-medium text-stone-800 dark:text-stone-200">
              {budgetHuman} {row.asset_symbol}
            </span>
            <span className="text-stone-400">·</span>
            <span className="text-stone-500">
              Indicative budget (not funded or escrowed)
            </span>
          </div>
          {tags.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {tags.map((t) => (
                <li
                  key={t.id}
                  className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs text-stone-700 dark:bg-stone-800 dark:text-stone-200"
                >
                  {t.label}
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-stone-500">
            <span className="capitalize">{row.timing_type}</span>
            {loc && <span>{loc}</span>}
            {row.published_at && (
              <time dateTime={row.published_at}>
                {new Date(row.published_at).toLocaleString()}
              </time>
            )}
          </div>
        </div>
      </Link>
    </article>
  );
}
