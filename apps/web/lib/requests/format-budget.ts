/**
 * Parse a numeric string (plain integer or scientific) into BigInt for yocto-scale
 * budgets. PostgREST may serialize large numerics as JSON numbers; clients then
 * stringify as `1e+25` which BigInt() rejects unless expanded.
 */
function bigintFromBudgetRawString(raw: string): bigint | null {
  const t = raw.trim().replace(/'/g, "");
  if (t === "" || t === "-" || t === "+") {
    return null;
  }

  if (/^-?\d+$/.test(t)) {
    try {
      return BigInt(t);
    } catch {
      return null;
    }
  }

  const m = /^(-?)(\d+)(?:\.(\d*))?[eE]([+-]?\d+)$/.exec(t);
  if (!m) {
    return null;
  }

  const sign = m[1] === "-" ? BigInt(-1) : BigInt(1);
  const intPart = m[2]!;
  const frac = m[3] ?? "";
  const exp = BigInt(m[4]!);
  const allDigits = intPart + frac;
  if (!/^\d+$/.test(allDigits) || allDigits === "") {
    return null;
  }

  const fracLen = BigInt(frac.length);
  const netExp = exp - fracLen;

  try {
    if (netExp >= BigInt(0)) {
      return sign * BigInt(allDigits) * BigInt(10) ** netExp;
    }
    const divisor = BigInt(10) ** -netExp;
    const base = BigInt(allDigits);
    if (base % divisor !== BigInt(0)) {
      return null;
    }
    return sign * (base / divisor);
  } catch {
    return null;
  }
}

function bigintFromBudgetAmount(
  budgetAmount: string | number,
): { ok: true; value: bigint } | { ok: false } {
  if (typeof budgetAmount === "string") {
    const n = bigintFromBudgetRawString(budgetAmount);
    return n != null ? { ok: true, value: n } : { ok: false };
  }

  if (!Number.isFinite(budgetAmount)) {
    return { ok: false };
  }

  if (Number.isSafeInteger(budgetAmount)) {
    try {
      return { ok: true, value: BigInt(budgetAmount) };
    } catch {
      return { ok: false };
    }
  }

  const n = bigintFromBudgetRawString(String(budgetAmount));
  return n != null ? { ok: true, value: n } : { ok: false };
}

export function normalizeAssetDecimals(decimals: unknown): number {
  const n =
    typeof decimals === "number"
      ? decimals
      : typeof decimals === "string"
        ? Number(decimals)
        : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : 24;
}

/** Format stored smallest-units budget for display (e.g. 0.001 NEAR from yocto). */
export function formatBudgetSmallestUnits(
  budgetAmount: string | number | null | undefined,
  decimals: number,
): string {
  if (budgetAmount == null) {
    return "";
  }

  const assetDecimals = normalizeAssetDecimals(decimals);

  const parsed = bigintFromBudgetAmount(budgetAmount);
  if (!parsed.ok) {
    return String(budgetAmount);
  }

  try {
    const amount = parsed.value;
    const factor = BigInt(10) ** BigInt(assetDecimals);
    if (factor <= BigInt(0)) {
      return amount.toString();
    }
    const whole = amount / factor;
    const frac = amount % factor;
    if (frac === BigInt(0)) {
      return whole.toString();
    }
    const fracStr = frac
      .toString()
      .padStart(assetDecimals, "0")
      .replace(/0+$/, "");
    return `${whole.toString()}.${fracStr}`;
  } catch {
    return String(budgetAmount);
  }
}
