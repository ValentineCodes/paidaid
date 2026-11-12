import type { Tables } from "../database.types";

const TITLE_MIN = 3;
const TITLE_MAX = 50;
const DESCRIPTION_MAX = 1000;
const MAX_PHOTOS = 1;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const ALLOWED_PHOTO_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export type RequestComposerFieldErrors = Partial<
  Record<
    | "title"
    | "description"
    | "timingType"
    | "scheduledAt"
    | "deadlineAt"
    | "expiresAt"
    | "locationKind"
    | "locationLabel"
    | "budgetHuman"
    | "budgetAssetId"
    | "photos"
    | "tags",
    string
  >
>;

export type RequestComposerValues = {
  title: string;
  description: string;
  timingType: "immediate" | "scheduled";
  scheduledAt: string;
  deadlineAt: string;
  expiresAt: string;
  locationKind: "unspecified" | "online" | "in_person";
  locationLabel: string;
  budgetHuman: string;
  budgetAssetId: string;
  tagIds: string[];
};

export function categoryLabel(category: Tables<"tags">["category"]): string {
  const map: Record<Tables<"tags">["category"], string> = {
    repairs_trades: "Repairs & trades",
    home: "Home",
    cars_transport: "Cars & transport",
    errands: "Errands",
    food_cooking: "Food & cooking",
    others: "Others",
  };
  return map[category];
}

/** Digits-only non-negative integer string, or null if empty/invalid. */
export function parseDigitsIntegerString(value: string): string | null {
  const t = value.trim();
  if (t === "") {
    return null;
  }
  if (!/^\d+$/.test(t)) {
    return null;
  }
  const stripped = t.replace(/^0+/, "");
  return stripped === "" ? "0" : stripped;
}

/**
 * Converts a human amount (e.g. `0.001`, `10`, `2.5`) to on-chain smallest units.
 * No floating point.
 */
export function humanAmountToSmallestUnits(
  humanAmount: string,
  decimals: number,
): { ok: true; smallestUnits: string } | { ok: false; error: string } {
  const trimmed = humanAmount.trim();
  if (trimmed === "") {
    return { ok: false, error: "Enter a budget amount" };
  }

  const m = /^(\d+)(?:\.(\d+))?$/.exec(trimmed);
  if (!m) {
    return {
      ok: false,
      error: "Enter a valid amount (e.g. 0.001 or 10)",
    };
  }

  const intPart = m[1]!;
  const fracPart = m[2] ?? "";

  if (fracPart.length > decimals) {
    return {
      ok: false,
      error: `Use at most ${decimals} decimal places for this asset`,
    };
  }

  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 128) {
    return { ok: false, error: "Invalid asset decimals" };
  }

  const intDigits = intPart.replace(/^0+/, "") || "0";
  const fracDigits = fracPart.replace(/0+$/, "");
  if (intDigits === "0" && fracDigits === "") {
    return { ok: false, error: "Budget must be positive" };
  }

  let factor: bigint;
  try {
    factor = BigInt(10) ** BigInt(decimals);
  } catch {
    return { ok: false, error: "Budget is too large" };
  }

  const fracPadded = fracPart.padEnd(decimals, "0");
  let scaled: bigint;
  try {
    const whole = BigInt(intDigits);
    const frac = fracPadded === "" ? BigInt(0) : BigInt(fracPadded);
    scaled = whole * factor + frac;
  } catch {
    return { ok: false, error: "Budget is too large" };
  }

  if (scaled <= BigInt(0)) {
    return { ok: false, error: "Budget must be positive" };
  }

  return { ok: true, smallestUnits: scaled.toString() };
}

export function validateBudgetSmallestUnitsAgainstAsset(
  smallestUnits: string,
  asset: Pick<Tables<"assets">, "decimals" | "symbol">,
): { ok: true } | { ok: false; error: string } {
  const normalized = parseDigitsIntegerString(smallestUnits);
  if (normalized === null || normalized === "0") {
    return { ok: false, error: "Budget must be positive" };
  }
  try {
    const n = BigInt(normalized);
    if (n <= BigInt(0)) {
      return { ok: false, error: "Budget must be positive" };
    }
  } catch {
    return { ok: false, error: "Invalid budget amount" };
  }

  return { ok: true };
}

export type PhotoLike = Pick<File, "size" | "type">;

export function validateRequestComposer(
  input: RequestComposerValues,
  assets: Tables<"assets">[],
  options?: { photoFiles?: PhotoLike[] },
): { fieldErrors: RequestComposerFieldErrors | null } {
  const fieldErrors: RequestComposerFieldErrors = {};

  const title = input.title.trim();
  if (title.length < TITLE_MIN || title.length > TITLE_MAX) {
    fieldErrors.title = `Title must be between ${TITLE_MIN} and ${TITLE_MAX} characters`;
  }

  if (input.description.length > DESCRIPTION_MAX) {
    fieldErrors.description = `Description must be at most ${DESCRIPTION_MAX} characters`;
  }

  if (input.timingType !== "immediate" && input.timingType !== "scheduled") {
    fieldErrors.timingType = "Choose whether this is now or scheduled";
  }

  if (input.timingType === "scheduled") {
    if (!input.scheduledAt.trim()) {
      fieldErrors.scheduledAt = "Pick a date and time for a scheduled request";
    }
  }

  if (input.deadlineAt.trim() && input.scheduledAt.trim()) {
    const sched = Date.parse(input.scheduledAt);
    const dl = Date.parse(input.deadlineAt);
    if (!Number.isNaN(sched) && !Number.isNaN(dl) && dl < sched) {
      fieldErrors.deadlineAt = "Deadline cannot be before the scheduled time";
    }
  }

  if (!["unspecified", "online", "in_person"].includes(input.locationKind)) {
    fieldErrors.locationKind = "Choose a location type";
  }
  if (input.locationKind === "in_person") {
    const loc = input.locationLabel.trim();
    if (loc.length < 1) {
      fieldErrors.locationLabel = "Add a short location for in-person tasks";
    }
  }

  const asset = assets.find((a) => a.id === input.budgetAssetId);
  if (!asset) {
    fieldErrors.budgetAssetId = "Select a supported asset";
  } else {
    const converted = humanAmountToSmallestUnits(
      input.budgetHuman,
      asset.decimals,
    );
    if (!converted.ok) {
      fieldErrors.budgetHuman = converted.error;
    } else {
      const prec = validateBudgetSmallestUnitsAgainstAsset(
        converted.smallestUnits,
        asset,
      );
      if (!prec.ok) {
        fieldErrors.budgetHuman = prec.error;
      }
    }
  }

  const uniqueTags = [...new Set(input.tagIds)];
  if (uniqueTags.length > 3) {
    fieldErrors.tags = "Choose at most 3 tags";
  }

  const photos: PhotoLike[] = options?.photoFiles ?? [];
  if (photos.length > MAX_PHOTOS) {
    fieldErrors.photos = `At most ${MAX_PHOTOS} photos`;
  }
  for (const f of photos) {
    if (f.size > MAX_PHOTO_BYTES) {
      fieldErrors.photos = "Each photo must be 10 MB or smaller";
      break;
    }
    if (!ALLOWED_PHOTO_TYPES.has(f.type)) {
      fieldErrors.photos = "Photos must be JPEG, PNG, WebP, or GIF";
      break;
    }
  }

  return {
    fieldErrors: Object.keys(fieldErrors).length > 0 ? fieldErrors : null,
  };
}
