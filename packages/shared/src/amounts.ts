/** Parse a non-negative decimal integer string into bigint (smallest units). */
export function parseSmallestUnitsString(value: string): bigint | null {
  const t = value.trim().replace(/'/g, "");
  if (t === "" || !/^\d+$/.test(t)) {
    return null;
  }
  try {
    return BigInt(t);
  } catch {
    return null;
  }
}

/** Format smallest-unit balance for display without floating point. */
export function formatSmallestUnits(amount: string, decimals: number): string {
  const units = parseSmallestUnitsString(amount);
  if (units == null) {
    return amount;
  }
  if (decimals < 0 || decimals > 128) {
    return amount;
  }
  try {
    const factor = BigInt(10) ** BigInt(decimals);
    if (factor > BigInt(0) && units % factor === BigInt(0)) {
      return (units / factor).toString();
    }
    const whole = units / factor;
    const frac = units % factor;
    const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
    return fracStr.length > 0 ? `${whole}.${fracStr}` : whole.toString();
  } catch {
    return amount;
  }
}

export function bigintToSmallestUnitsString(value: bigint): string {
  if (value < BigInt(0)) {
    throw new Error("Negative token amounts are not supported.");
  }
  return value.toString();
}

function parseScientificNotationToBigInt(value: string): bigint | null {
  const m = /^([+-]?)(\d+(?:\.\d+)?)[eE]([+-]?\d+)$/.exec(value.trim());
  if (!m) {
    return null;
  }
  const negative = m[1] === "-";
  const [intPart, fracPart = ""] = m[2].split(".");
  const exp = Number(m[3]);
  if (!Number.isInteger(exp) || exp < 0) {
    return null;
  }
  const digits = `${intPart}${fracPart}`;
  if (!/^\d+$/.test(digits)) {
    return null;
  }
  const shift = exp - fracPart.length;
  if (shift < 0) {
    return null;
  }
  const body = shift === 0 ? digits : `${digits}${"0".repeat(shift)}`;
  try {
    const units = BigInt(body);
    return negative ? -units : units;
  } catch {
    return null;
  }
}

/**
 * Postgres `numeric` / JSON may arrive as number (5e+24) or scientific string.
 * Returns a plain decimal string safe for `BigInt(...)`.
 */
export function normalizeDbNumericAmount(value: unknown): string {
  if (value === null || value === undefined) {
    throw new Error("Amount is required.");
  }

  if (typeof value === "bigint") {
    return bigintToSmallestUnitsString(value);
  }

  if (typeof value === "string") {
    const direct = parseSmallestUnitsString(value);
    if (direct != null) {
      return bigintToSmallestUnitsString(direct);
    }
    const sci = parseScientificNotationToBigInt(value);
    if (sci != null) {
      return bigintToSmallestUnitsString(sci);
    }
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    if (Number.isInteger(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER) {
      return bigintToSmallestUnitsString(BigInt(value));
    }
    const sci = parseScientificNotationToBigInt(value.toExponential());
    if (sci != null) {
      return bigintToSmallestUnitsString(sci);
    }
  }

  throw new Error(`Invalid smallest-unit amount: ${String(value)}`);
}

export function smallestUnitsStringToBigInt(value: string): bigint {
  return BigInt(normalizeDbNumericAmount(value));
}
