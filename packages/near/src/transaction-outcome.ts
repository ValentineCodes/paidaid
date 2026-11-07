/** Intear / postMessage outcomes may be shallow Map entry arrays — recurse into objects. */
export function isMapEntryArray(value: unknown): value is [string, unknown][] {
  if (!Array.isArray(value) || value.length === 0) {
    return false;
  }
  return value.every(
    (item) =>
      Array.isArray(item) &&
      item.length === 2 &&
      typeof item[0] === "string",
  );
}

export function normalizeTransactionOutcome(outcome: unknown): unknown {
  if (isMapEntryArray(outcome)) {
    return normalizeTransactionOutcome(Object.fromEntries(outcome));
  }
  if (Array.isArray(outcome)) {
    return outcome.map((item) => normalizeTransactionOutcome(item));
  }
  if (!outcome || typeof outcome !== "object") {
    return outcome;
  }
  const record = outcome as Record<string, unknown>;
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    normalized[key] = normalizeTransactionOutcome(value);
  }
  return normalized;
}

type OutcomeLike = {
  transaction_outcome?: { id?: string };
  transaction?: { hash?: string };
  tx_hash?: string;
  transaction_hash?: string;
};

/** Best-effort tx hash from wallet or RPC execution outcomes. */
export function extractTransactionHash(outcome: unknown): string | null {
  const normalized = normalizeTransactionOutcome(outcome);
  if (!normalized || typeof normalized !== "object") {
    return null;
  }

  if (Array.isArray(normalized)) {
    for (const entry of normalized) {
      const hash = extractTransactionHash(entry);
      if (hash) {
        return hash;
      }
    }
    return null;
  }

  const value = normalized as OutcomeLike;
  const candidates = [
    value.transaction?.hash,
    value.tx_hash,
    value.transaction_hash,
    value.transaction_outcome?.id,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.length > 0) {
      return candidate;
    }
  }

  return null;
}
