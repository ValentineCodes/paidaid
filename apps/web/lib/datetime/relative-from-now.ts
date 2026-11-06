/**
 * Relative time labels for server components. Prefer passing `nowMs` from the
 * route (after `connection()` in Cache Components) instead of calling Date.now()
 * inside shared UI so prerender stays deterministic.
 */
export function formatPostedRelative(
  d: Date,
  nowMs: number,
): string {
  const diffMs = nowMs - d.getTime();
  const sec = Math.floor(diffMs / 1000);
  const min = Math.floor(sec / 60);
  const hr = Math.floor(min / 60);
  const day = Math.floor(hr / 24);
  if (sec < 60) {
    return "Just now";
  }
  if (min < 60) {
    return `${min} min ago`;
  }
  if (hr < 24) {
    return `${hr} hr${hr === 1 ? "" : "s"} ago`;
  }
  if (day < 7) {
    return `${day} day${day === 1 ? "" : "s"} ago`;
  }
  return d.toLocaleDateString();
}

/** Same 24h-bucket logic as the previous `Date.now() - d` helper, but with stable `nowMs`. */
export function formatReviewAgo(iso: string, nowMs: number): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return "—";
  }
  const diff = nowMs - d.getTime();
  const day = Math.floor(diff / (24 * 60 * 60 * 1000));
  if (day < 1) {
    return "Today";
  }
  if (day < 7) {
    return `${day} day${day === 1 ? "" : "s"} ago`;
  }
  if (day < 30) {
    const w = Math.floor(day / 7);
    return `${w} week${w === 1 ? "" : "s"} ago`;
  }
  const m = Math.floor(day / 30);
  return `${m} month${m === 1 ? "" : "s"} ago`;
}
