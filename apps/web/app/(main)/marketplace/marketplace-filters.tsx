import Link from "next/link";

import type { Tables } from "../../../lib/database.types";
import { categoryLabel } from "../../../lib/validation/request";
import { discoverySearchString } from "../../../lib/discovery/build-url";

type MarketplaceFiltersProps = {
  assets: Tables<"assets">[];
  tags: Tables<"tags">[];
  /** When true, omit the search row (e.g. hero search on home). */
  hideSearchField?: boolean;
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
  hideSearchField = false,
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
    <section className="filter-panel" aria-label="Search and filters">
      <form method="get" action="/" className="form-fields">
        {state.selectedTagIds.map((id) => (
          <input key={id} type="hidden" name="tags" value={id} />
        ))}
        {!hideSearchField ? (
          <>
            <label>
              Search
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <input
                  id="mq"
                  name="q"
                  type="search"
                  placeholder="Title or description…"
                  defaultValue={state.q}
                  className="min-w-0 flex-1"
                />
                <button type="submit" className="primary h-[46px] shrink-0 sm:px-6">
                  Search
                </button>
              </div>
            </label>
          </>
        ) : state.q ? (
          <input type="hidden" name="q" value={state.q} />
        ) : null}

        <div className="two-col">
          <label>
            Category
            <select name="category" defaultValue={state.category}>
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {categoryLabel(c)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Asset
            <select name="asset" defaultValue={state.assetId}>
              <option value="">All assets</option>
              {assets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.symbol} ({a.chain_id})
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Task location
          <select name="location" defaultValue={state.location}>
            <option value="">Any</option>
            <option value="online">Online</option>
            <option value="in_person">In person</option>
          </select>
        </label>

        <div className="modal-actions mb-0 border-t-0 pt-0">
          <button type="submit" className="primary">
            Apply filters
          </button>
          <Link
            href={clearHref}
            className="secondary inline-flex h-[43px] items-center px-5"
          >
            Clear all
          </Link>
        </div>
      </form>

      <div className="border-t border-[var(--line)] pt-4">
        <p className="text-[11px] font-bold tracking-[0.12em] text-[var(--muted)]">
          TAGS
        </p>
        <p className="mt-1 text-[11px] text-[var(--muted)]">
          Tap to include; requests match all selected tags.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {tags.map((t) => {
            const active = state.selectedTagIds.includes(t.id);
            const href = toggleTagUrl(state, t.id);
            return (
              <Link
                key={t.id}
                href={href}
                scroll={false}
                className={`tag-pill ${active ? "active" : ""}`}
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
