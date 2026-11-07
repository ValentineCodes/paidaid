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

function statusIndicatesFailure(status: unknown): boolean {
  if (typeof status !== "object" || status === null) {
    return false;
  }
  return Object.prototype.hasOwnProperty.call(status, "Failure");
}

function statusIndicatesSuccess(status: unknown): boolean {
  if (typeof status !== "object" || status === null) {
    return false;
  }
  const record = status as Record<string, unknown>;
  return (
    Object.prototype.hasOwnProperty.call(record, "SuccessValue") ||
    Object.prototype.hasOwnProperty.call(record, "SuccessReceiptId")
  );
}

/** RPC final execution outcome reports an on-chain transaction failure. */
export class TransactionExecutionFailedError extends Error {
  constructor(message = "Transaction execution failed on NEAR") {
    super(message);
    this.name = "TransactionExecutionFailedError";
  }
}

/**
 * Require a final execution outcome to be successful when the RPC payload is present.
 * Throws {@link TransactionExecutionFailedError} for explicit failures.
 */
export function assertTransactionFinalSuccess(outcome: unknown): void {
  const normalized = normalizeTransactionOutcome(outcome);
  if (!normalized || typeof normalized !== "object") {
    throw new Error("Missing transaction outcome");
  }
  const root = normalized as Record<string, unknown>;

  if (statusIndicatesFailure(root.status)) {
    throw new TransactionExecutionFailedError();
  }

  const txOutcome = root.transaction_outcome;
  if (txOutcome && typeof txOutcome === "object") {
    const inner = (txOutcome as { outcome?: { status?: unknown } }).outcome;
    if (statusIndicatesFailure(inner?.status)) {
      throw new TransactionExecutionFailedError();
    }
  }

  const rootSuccess = statusIndicatesSuccess(root.status);
  const txSuccess = statusIndicatesSuccess(
    (txOutcome as { outcome?: { status?: unknown } } | undefined)?.outcome
      ?.status,
  );
  if (!rootSuccess && !txSuccess) {
    throw new Error("Transaction final success not confirmed by RPC outcome");
  }
}

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
