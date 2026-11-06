import Link from "next/link";

import type { Tables } from "../../../lib/database.types";
import { categoryLabel } from "../../../lib/validation/request";
import { discoverySearchString } from "../../../lib/discovery/build-url";
type MarketplaceFiltersProps = {
  assets: Tables<"assets">[];
  tags: Tables<"tags">[];
  /** Current filter state for building URLs */
  state: {
    q: string;
    selectedTagIds: string[];
    category: string;
    assetId: string;
    location: string;
  };
};

function toggleTagUrl(
  state: MarketplaceFiltersProps["state"],
  tagId: string,
): string {
  const set = new Set(state.selectedTagIds);
  if (set.has(tagId)) {
    set.delete(tagId);
  } else {
    set.add(tagId);
  }
  return (
    "/" +
    discoverySearchString({
      q: state.q,
      tags: [...set],
      category: state.category as MarketplaceFiltersProps["state"]["category"],
      asset: state.assetId,
      location: state.location,
    })
  );
}

export function MarketplaceFilters({
  assets,
  tags,
  state,
}: MarketplaceFiltersProps) {
  const clearHref =
    "/" +
    discoverySearchString({
      q: "",
      tags: [],
      category: "",
      asset: "",
      location: "",
    });

  const categories = [
    ...new Set(tags.map((t) => t.category)),
  ] as Tables<"tags">["category"][];

  return (
    <section
      className="rounded-xl border border-stone-200 bg-stone-50/80 p-4 dark:border-stone-800 dark:bg-stone-900/40"
      aria-label="Search and filters"
    >
      <form method="get" action="/" className="flex flex-col gap-4">
        {state.selectedTagIds.map((id) => (
          <input key={id} type="hidden" name="tags" value={id} />
        ))}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <label
              htmlFor="mq"
              className="text-sm font-medium text-stone-700 dark:text-stone-300"
            >
              Search
            </label>
            <input
              id="mq"
              name="q"
              type="search"
              placeholder="Title or description…"
              defaultValue={state.q}
              className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-stone-900 outline-none ring-stone-400 focus:ring-2 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100"
            />
          </div>
          <button
            type="submit"
            className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-200"
          >
            Search
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-stone-700 dark:text-stone-300">
              Category
            </span>
            <select
              name="category"
              defaultValue={state.category}
              className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-stone-900 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100"
            >
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {categoryLabel(c)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-stone-700 dark:text-stone-300">
              Asset
            </span>
            <select
              name="asset"
              defaultValue={state.assetId}
              className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-stone-900 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100"
            >
              <option value="">All assets</option>
              {assets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.symbol} ({a.chain_id})
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-stone-700 dark:text-stone-300">
              Task location
            </span>
            <select
              name="location"
              defaultValue={state.location}
              className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-stone-900 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100"
            >
              <option value="">Any</option>
              <option value="online">Online</option>
              <option value="in_person">In person</option>
            </select>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-800 hover:bg-stone-100 dark:border-stone-600 dark:text-stone-100 dark:hover:bg-stone-800"
          >
            Apply filters
          </button>
          <Link
            href={clearHref}
            className="text-sm font-medium text-stone-600 underline hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100"
          >
            Clear all
          </Link>
        </div>
      </form>

      <div className="mt-4 border-t border-stone-200 pt-4 dark:border-stone-700">
        <p className="text-xs font-medium tracking-wide text-stone-500 uppercase">
          Tags
        </p>
        <p className="mt-1 text-xs text-stone-500">
          Tap to include; requests match all selected tags. Max three on a post;
          you can pick multiple here to narrow the feed.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {tags.map((t) => {
            const active = state.selectedTagIds.includes(t.id);
            const href = toggleTagUrl(state, t.id);
            return (
              <Link
                key={t.id}
                href={href}
                scroll={false}
                className={`rounded-full border px-3 py-1 text-sm transition ${
                  active
                    ? "border-stone-900 bg-stone-900 text-white dark:border-stone-100 dark:bg-stone-100 dark:text-stone-900"
                    : "border-stone-300 text-stone-700 hover:border-stone-500 dark:border-stone-600 dark:text-stone-200"
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
