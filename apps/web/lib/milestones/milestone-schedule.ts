import {
  humanAmountToSmallestUnits,
  parseDigitsIntegerString,
} from "../validation/request";

export const MILESTONE_MIN_COUNT = 2;
export const MILESTONE_MAX_COUNT = 5;

export type MilestoneDraft = {
  position: number;
  title: string;
  description: string;
  amountHuman: string;
};

export type MilestoneRpcRow = {
  position: number;
  title: string;
  description: string;
  amount: string;
};

export function sumSmallestUnitStrings(values: string[]): bigint {
  let sum = 0n;
  for (const v of values) {
    const digits = parseDigitsIntegerString(v);
    if (!digits) {
      continue;
    }
    sum += BigInt(digits);
  }
  return sum;
}

export function formatMilestoneTotalsLine(args: {
  totalSmallest: bigint;
  budgetSmallest: string;
  decimals: number;
  symbol: string;
  formatHuman: (smallest: string, decimals: number) => string;
}): { matches: boolean; totalHuman: string; budgetHuman: string; remainingHuman: string } {
  const budgetDigits = parseDigitsIntegerString(args.budgetSmallest) ?? "0";
  const budget = BigInt(budgetDigits);
  const remaining = budget - args.totalSmallest;
  const matches = remaining === 0n;
  return {
    matches,
    totalHuman: args.formatHuman(args.totalSmallest.toString(), args.decimals),
    budgetHuman: args.formatHuman(budgetDigits, args.decimals),
    remainingHuman: args.formatHuman(
      (remaining < 0n ? -remaining : remaining).toString(),
      args.decimals,
    ),
  };
}

export type MilestoneScheduleFieldErrors = Partial<
  Record<`milestone_${number}_title` | `milestone_${number}_amount` | "milestones", string>
>;

export function defaultMilestoneDrafts(count: number): MilestoneDraft[] {
  const n = Math.min(
    MILESTONE_MAX_COUNT,
    Math.max(MILESTONE_MIN_COUNT, count),
  );
  return Array.from({ length: n }, (_, i) => ({
    position: i + 1,
    title: "",
    description: "",
    amountHuman: "",
  }));
}

export function reindexMilestoneDrafts(drafts: MilestoneDraft[]): MilestoneDraft[] {
  return drafts.map((m, i) => ({ ...m, position: i + 1 }));
}

export function validateMilestoneDrafts(
  drafts: MilestoneDraft[],
  budgetSmallest: string,
  decimals: number,
): { ok: true; rows: MilestoneRpcRow[] } | { ok: false; fieldErrors: MilestoneScheduleFieldErrors } {
  const fieldErrors: MilestoneScheduleFieldErrors = {};

  if (drafts.length < MILESTONE_MIN_COUNT || drafts.length > MILESTONE_MAX_COUNT) {
    fieldErrors.milestones = `Use between ${MILESTONE_MIN_COUNT} and ${MILESTONE_MAX_COUNT} milestones`;
    return { ok: false, fieldErrors };
  }

  const amounts: string[] = [];
  const rows: MilestoneRpcRow[] = [];

  for (const m of drafts) {
    const title = m.title.trim();
    if (title.length < 1 || title.length > 200) {
      fieldErrors[`milestone_${m.position}_title`] = "Enter a milestone title (1–200 characters)";
    }
    if (m.description.length > 4000) {
      fieldErrors.milestones = "A milestone description is too long";
    }
    const converted = humanAmountToSmallestUnits(m.amountHuman.trim(), decimals);
    if (!converted.ok) {
      fieldErrors[`milestone_${m.position}_amount`] = converted.error;
    } else {
      const digits = parseDigitsIntegerString(converted.smallestUnits);
      if (!digits || digits === "0") {
        fieldErrors[`milestone_${m.position}_amount`] = "Amount must be positive";
      } else {
        amounts.push(digits);
        rows.push({
          position: m.position,
          title,
          description: m.description.trim(),
          amount: digits,
        });
      }
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors };
  }

  const budgetDigits = parseDigitsIntegerString(budgetSmallest);
  if (!budgetDigits) {
    fieldErrors.milestones = "Set a valid task budget first";
    return { ok: false, fieldErrors };
  }

  const sum = sumSmallestUnitStrings(amounts);
  if (sum !== BigInt(budgetDigits)) {
    fieldErrors.milestones = "Milestone amounts must add up to the task budget exactly";
    return { ok: false, fieldErrors };
  }

  return { ok: true, rows: rows.sort((a, b) => a.position - b.position) };
}

export function parseMilestoneDraftsJson(raw: string): MilestoneDraft[] | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return null;
    }
    const out: MilestoneDraft[] = [];
    for (const item of parsed) {
      if (typeof item !== "object" || item === null) {
        return null;
      }
      const row = item as Record<string, unknown>;
      if (
        typeof row.position !== "number" ||
        typeof row.title !== "string" ||
        typeof row.description !== "string" ||
        typeof row.amountHuman !== "string"
      ) {
        return null;
      }
      out.push({
        position: row.position,
        title: row.title,
        description: row.description,
        amountHuman: row.amountHuman,
      });
    }
    return out;
  } catch {
    return null;
  }
}

export type MilestoneDisplayRow = {
  position: number;
  title: string;
  description: string;
  amountSmallest: string;
};

export function milestoneOfferTermsReady(
  paymentMode: string | null | undefined,
  milestoneOfferStatus: string | null | undefined,
): boolean {
  if (paymentMode !== "milestones") {
    return true;
  }
  return (
    milestoneOfferStatus === "accepted_as_proposed" ||
    milestoneOfferStatus === "agreed"
  );
}
