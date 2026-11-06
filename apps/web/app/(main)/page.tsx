import Link from "next/link";

import { createClient } from "../../lib/supabase/server";
import { isSupabaseConfigured } from "../../lib/supabase/env";
import {
  buildFeedCursorParam,
  parseDiscoveryParams,
} from "../../lib/discovery/feed-params";
import { discoverySearchString } from "../../lib/discovery/build-url";
import { MarketplaceFilters } from "./marketplace/marketplace-filters";
import { RequestFeedCard, type FeedCardRow } from "./request-feed-card";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function MarketplaceHomePage({ searchParams }: PageProps) {
  const sp = await searchParams;

  if (!isSupabaseConfigured()) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-2xl font-semibold">Marketplace</h1>
        <p className="mt-2 text-stone-600 dark:text-stone-400">
          Set{" "}
          <code className="font-mono text-sm">NEXT_PUBLIC_SUPABASE_URL</code>{" "}
          and{" "}
          <code className="font-mono text-sm">
            NEXT_PUBLIC_SUPABASE_ANON_KEY
          </code>{" "}
          in <code className="font-mono text-sm">apps/web/.env.local</code>.
        </p>
      </main>
    );
  }

  const supabase = await createClient();
  const parsed = parseDiscoveryParams(sp);

  const [{ data: assets }, { data: tags }] = await Promise.all([
    supabase.from("assets").select("*").order("canonical_asset_key"),
    supabase.from("tags").select("*").order("category").order("sort_order"),
  ]);

  const tagIdsParam = Array.isArray(sp.tags)
    ? sp.tags.filter(
        (x): x is string => typeof x === "string" && /^[0-9a-f-]{36}$/i.test(x),
      )
    : typeof sp.tags === "string"
      ? sp.tags
          .split(",")
          .map((s) => s.trim())
          .filter((s) => /^[0-9a-f-]{36}$/i.test(s))
      : [];

  const filterState = {
    q: typeof sp.q === "string" ? sp.q : "",
    selectedTagIds: tagIdsParam,
    category: typeof sp.category === "string" ? sp.category : "",
    assetId: typeof sp.asset === "string" ? sp.asset : "",
    location: typeof sp.location === "string" ? sp.location : "",
  };

  const { data: rows, error } = await supabase.rpc("list_requests_public", {
    p_search: parsed.search || undefined,
    p_tag_ids: parsed.tagIds.length ? parsed.tagIds : undefined,
    p_category: parsed.category ?? undefined,
    p_asset_id: parsed.assetId ?? undefined,
    p_location_kind: parsed.locationKind ?? undefined,
    p_limit: parsed.limit,
    p_cursor_published_at: parsed.cursorPublishedAt ?? undefined,
    p_cursor_id: parsed.cursorId ?? undefined,
  });

  const feed = (rows ?? []) as unknown as FeedCardRow[];
  const last = feed[feed.length - 1];
  const hasMore = feed.length === parsed.limit && last;
  const nextCursor =
    hasMore && last.published_at
      ? buildFeedCursorParam(last.published_at, last.id)
      : null;

  const baseQuery = discoverySearchString({
    q: filterState.q,
    tags: filterState.selectedTagIds,
    category: filterState.category as never,
    asset: filterState.assetId,
    location: filterState.location,
  });

  const nextHref =
    nextCursor && baseQuery !== ""
      ? `${baseQuery}&after=${encodeURIComponent(nextCursor)}`
      : nextCursor
        ? `?after=${encodeURIComponent(nextCursor)}`
        : null;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-10">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Marketplace</h1>
        <p className="mt-1 max-w-2xl text-sm text-stone-600 dark:text-stone-400">
          Open requests you can browse without an account. Budgets are
          indicative only — not deposited or escrowed.
        </p>
      </div>

      {assets?.length && tags?.length ? (
        <MarketplaceFilters assets={assets} tags={tags} state={filterState} />
      ) : null}

      {error && (
        <p
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
          role="alert"
        >
          {error.message}
        </p>
      )}

      {!error && feed.length === 0 && (
        <p className="rounded-lg border border-stone-200 px-4 py-8 text-center text-stone-600 dark:border-stone-800 dark:text-stone-400">
          No open requests match your filters. Try clearing filters or check
          back later.
        </p>
      )}

      <ul className="flex flex-col gap-4">
        {feed.map((row) => (
          <li key={row.id}>
            <RequestFeedCard row={row} />
          </li>
        ))}
      </ul>

      {nextHref && (
        <div className="flex justify-center">
          <Link
            href={nextHref}
            className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium text-stone-800 hover:bg-stone-100 dark:border-stone-600 dark:text-stone-100 dark:hover:bg-stone-800"
            scroll={false}
          >
            Load more
          </Link>
        </div>
      )}
    </main>
  );
}
