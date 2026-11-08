import Link from "next/link";
import { connection } from "next/server";

import { getRequestWallTimeMs } from "../../lib/datetime/request-wall-time";
import { createClient } from "../../lib/supabase/server";
import { isSupabaseConfigured } from "../../lib/supabase/env";
import {
  buildFeedCursorParam,
  parseDiscoveryParams,
} from "../../lib/discovery/feed-params";
import { discoverySearchString } from "../../lib/discovery/build-url";
import { loadRequestCreateCatalog } from "../../lib/requests/load-create-catalog";
import { HomePostTask } from "./home-post-task";
import { RequestFeedCard, type FeedCardRow } from "./request-feed-card";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function Icon({
  name,
  size = 22,
}: {
  name: "search" | "shield" | "message" | "briefcase" | "arrow";
  size?: number;
}) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none" as const,
    stroke: "currentColor" as const,
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };
  switch (name) {
    case "search":
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-4-4" />
        </svg>
      );
    case "shield":
      return (
        <svg {...common}>
          <path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" />
        </svg>
      );
    case "message":
      return (
        <svg {...common}>
          <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z" />
        </svg>
      );
    case "briefcase":
      return (
        <svg {...common}>
          <rect x="3" y="7" width="18" height="13" rx="2" />
          <path d="M8 7V4h8v3M3 12h18M10 12v2h4v-2" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <path d="M5 12h14M14 7l5 5-5 5" />
        </svg>
      );
  }
}

export default async function MarketplaceHomePage({ searchParams }: PageProps) {
  const sp = await searchParams;

  if (!isSupabaseConfigured()) {
    return (
      <main>
        <section className="hero">
          <div className="eyebrow">
            <span /> Open marketplace · Built for people
          </div>
          <h1>
            If you can pay for it,
            <br />
            <em>someone can do it.</em>
          </h1>
          <p>Configure Supabase to load live requests.</p>
          <p className="max-w-xl text-[13px] text-[var(--muted)]">
            Set{" "}
            <code className="font-mono text-sm text-[var(--ink)]">
              NEXT_PUBLIC_SUPABASE_URL
            </code>{" "}
            and{" "}
            <code className="font-mono text-sm text-[var(--ink)]">
              NEXT_PUBLIC_SUPABASE_ANON_KEY
            </code>{" "}
            in <code className="font-mono text-sm">apps/web/.env.local</code>.
          </p>
        </section>
      </main>
    );
  }

  await connection();
  const nowMs = getRequestWallTimeMs();

  const supabase = await createClient();
  const parsed = parseDiscoveryParams(sp);

  const { data: rows, error } = await supabase.rpc("list_requests_public", {
    p_search: parsed.search || undefined,
    p_tag_ids: undefined,
    p_category: undefined,
    p_asset_id: undefined,
    p_location_kind: undefined,
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

  const q = typeof sp.q === "string" ? sp.q : "";
  const openCreate = sp.create === "1" || sp.create === "true";
  let createCatalog = null;
  try {
    createCatalog = await loadRequestCreateCatalog(supabase);
  } catch {
    createCatalog = null;
  }
  const baseQuery = discoverySearchString({ q });

  const nextHref =
    nextCursor && baseQuery !== ""
      ? `${baseQuery}&after=${encodeURIComponent(nextCursor)}`
      : nextCursor
        ? `?after=${encodeURIComponent(nextCursor)}`
        : null;

  return (
    <main>
      <section className="hero">
        <div className="eyebrow">
          <span /> Open marketplace · Built for people
        </div>
        <h1>
          If you can pay for it,
          <br />
          <em>someone can do it.</em>
        </h1>
        <p>
          Real people, useful work, direct connection. Post what you need or find
          something worth doing.
        </p>
        <form method="get" action="/" className="search-wrap">
          <Icon name="search" />
          <input
            name="q"
            type="search"
            defaultValue={q}
            placeholder="What can you help with?"
            aria-label="Search tasks"
          />
          <button type="submit">Search</button>
        </form>
        <div className="trust-row">
          <span>
            <Icon name="shield" size={16} /> Human verified
          </span>
          <span>
            <Icon name="message" size={16} /> Direct messaging
          </span>
          <span>
            <Icon name="briefcase" size={16} /> One account, both ways
          </span>
        </div>
      </section>

      <section className="market">
        <div className="section-head">
          <div>
            <span className="section-kicker">THE MARKETPLACE</span>
            <h2>Work worth doing</h2>
          </div>
          <HomePostTask catalog={createCatalog} initialOpen={openCreate} />
        </div>

        {error && (
          <p
            className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
            role="alert"
          >
            {error.message}
          </p>
        )}

        {!error && feed.length === 0 && (
          <div className="empty">
            <Icon name="search" size={30} />
            <h3>No tasks found</h3>
            <p>Try another search or check back later.</p>
          </div>
        )}

        {!error && feed.length > 0 ? (
          <div className="task-grid">
            {feed.map((row) => (
              <RequestFeedCard key={row.id} row={row} nowMs={nowMs} />
            ))}
          </div>
        ) : null}

        {nextHref && (
          <div className="mt-8 flex justify-center">
            <Link href={nextHref} className="primary" scroll={false}>
              Load more
              <Icon name="arrow" size={16} />
            </Link>
          </div>
        )}
      </section>
    </main>
  );
}
