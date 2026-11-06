const DOT_KIND = [
  "orange",
  "violet",
  "blue",
  "green",
  "pink",
  "yellow",
] as const;

export type CategoryDotKind = (typeof DOT_KIND)[number];

/** Deterministic dot color class for a category/tag label (matches feed cards). */
export function categoryDotClassForLabel(label: string): CategoryDotKind {
  let h = 0;
  for (let i = 0; i < label.length; i += 1) {
    h = (h + label.charCodeAt(i) * (i + 1)) % 997;
  }
  return DOT_KIND[h % DOT_KIND.length];
}
