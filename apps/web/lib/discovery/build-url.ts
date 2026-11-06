export type DiscoveryUrlState = {
  q?: string;
  tags?: string[];
  category?: string;
  asset?: string;
  location?: string;
  after?: string;
};

/** Build `/?` query string for discovery (omits empty values). */
export function discoverySearchString(state: DiscoveryUrlState): string {
  const p = new URLSearchParams();
  if (state.q?.trim()) {
    p.set("q", state.q.trim());
  }
  if (state.tags?.length) {
    for (const id of state.tags) {
      if (id) {
        p.append("tags", id);
      }
    }
  }
  if (state.category) {
    p.set("category", state.category);
  }
  if (state.asset) {
    p.set("asset", state.asset);
  }
  if (state.location) {
    p.set("location", state.location);
  }
  if (state.after) {
    p.set("after", state.after);
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}
