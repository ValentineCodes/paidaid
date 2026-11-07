const REQUESTS_PREFIX = "/requests/";

const NON_DETAIL_SEGMENTS = new Set(["new", "mine"]);

/** URL is a single request detail segment (modal intercept or full page). */
export function isRequestDetailModalPath(pathname: string | null): boolean {
  if (!pathname?.startsWith(REQUESTS_PREFIX)) {
    return false;
  }
  const segment = pathname.slice(REQUESTS_PREFIX.length);
  if (!segment || segment.includes("/")) {
    return false;
  }
  return !NON_DETAIL_SEGMENTS.has(segment);
}
