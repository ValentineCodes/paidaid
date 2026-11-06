import type { Database } from "../database.types";

export const DISCOVERY_PAGE_SIZE = 20;
export const DISCOVERY_PAGE_SIZE_MAX = 50;

export type DiscoverySearchParams = {
  q?: string;
  tags?: string | string[];
  category?: string;
  asset?: string;
  location?: string;
  after?: string;
};

export type ParsedFeedParams = {
  search: string;
  tagIds: string[];
  category: Database["public"]["Enums"]["tag_category"] | null;
  assetId: string | null;
  locationKind: Database["public"]["Enums"]["location_kind"] | null;
  cursorPublishedAt: string | null;
  cursorId: string | null;
  limit: number;
};

const CATEGORIES = new Set<string>([
  "repairs_trades",
  "home",
  "cars_transport",
  "errands",
  "food_cooking",
  "others",
]);

const LOCATION_FILTER = new Set<string>(["online", "in_person"]);

function parseUuidList(raw: string | undefined): string[] {
  if (!raw?.trim()) {
    return [];
  }
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s),
    );
}

function parseCursor(after: string | undefined): {
  publishedAt: string | null;
  id: string | null;
} {
  if (!after?.includes("|")) {
    return { publishedAt: null, id: null };
  }
  const bar = after.indexOf("|");
  const iso = after.slice(0, bar);
  const id = after.slice(bar + 1);
  if (
    !Number.isFinite(Date.parse(iso)) ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  ) {
    return { publishedAt: null, id: null };
  }
  return { publishedAt: new Date(iso).toISOString(), id };
}

function firstString(v: string | string[] | undefined): string | undefined {
  if (v == null) {
    return undefined;
  }
  return Array.isArray(v) ? v[0] : v;
}

function tagsFromParam(v: string | string[] | undefined): string[] {
  if (v == null) {
    return [];
  }
  if (Array.isArray(v)) {
    return parseUuidList(v.join(","));
  }
  return parseUuidList(v);
}

/** Map URL search params to RPC args (caller validates against catalogue). */
export function parseDiscoveryParams(
  sp: DiscoverySearchParams | Record<string, string | string[] | undefined>,
): ParsedFeedParams {
  const q = typeof sp.q === "string" ? sp.q : "";
  const tagIds = tagsFromParam(
    (sp as Record<string, string | string[] | undefined>).tags,
  );
  const categoryRaw =
    firstString(
      (sp as Record<string, string | string[] | undefined>).category,
    ) ?? "";
  const assetRaw =
    firstString((sp as Record<string, string | string[] | undefined>).asset) ??
    "";
  const locationRaw =
    firstString(
      (sp as Record<string, string | string[] | undefined>).location,
    ) ?? "";
  const afterRaw =
    firstString((sp as Record<string, string | string[] | undefined>).after) ??
    "";

  const category = CATEGORIES.has(categoryRaw)
    ? (categoryRaw as Database["public"]["Enums"]["tag_category"])
    : null;

  const locationKind = LOCATION_FILTER.has(locationRaw)
    ? (locationRaw as Database["public"]["Enums"]["location_kind"])
    : null;

  const assetId =
    assetRaw &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      assetRaw,
    )
      ? assetRaw
      : null;

  const { publishedAt, id } = parseCursor(afterRaw);

  return {
    search: q.trim(),
    tagIds,
    category,
    assetId,
    locationKind,
    cursorPublishedAt: publishedAt,
    cursorId: id,
    limit: DISCOVERY_PAGE_SIZE,
  };
}

export function buildFeedCursorParam(
  publishedAt: string | null,
  id: string,
): string | null {
  if (!publishedAt) {
    return null;
  }
  return `${publishedAt}|${id}`;
}
