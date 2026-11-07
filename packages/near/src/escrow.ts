import {
  ESCROW_METHODS,
  type EscrowNearConfig,
  normalizeDbNumericAmount,
} from "@paidaid/shared";
import { getTransactionLastResult } from "near-api-js";
import { createProvider } from "./rpc";
import {
  isMapEntryArray,
  normalizeTransactionOutcome,
} from "./transaction-outcome";

export type OnChainEscrowStatus =
  | "Pending"
  | "Funded"
  | "Releasing"
  | "Refunding"
  | "Released"
  | "Refunded";

export type OnChainEscrowRecord = {
  engagement_id: string;
  requester: string;
  provider: string;
  asset: "Native" | "Nep141";
  ft_contract: string | null;
  amount: string | number;
  deposited: string | number;
  status: OnChainEscrowStatus;
};

function smallestUnitsFromChainValue(value: unknown): bigint {
  return BigInt(normalizeDbNumericAmount(value));
}

export type FundingVerificationExpectation = {
  engagementId: string;
  requesterNearAccountId: string;
  providerNearAccountId: string;
  amountSmallestUnits: string;
  assetStandard: "native" | "nep141";
  ftContractId: string | null;
};

export function requireEscrowContractId(config: EscrowNearConfig): string {
  if (!config.escrowContractId?.trim()) {
    throw new Error("NEAR escrow contract id is required");
  }
  return config.escrowContractId.trim();
}

export async function viewEscrowRecord(
  config: EscrowNearConfig,
  escrowId: string | number | bigint,
): Promise<OnChainEscrowRecord | null> {
  const contractId = requireEscrowContractId(config);
  const result = await createProvider(config).callFunction<OnChainEscrowRecord>({
    contractId,
    method: ESCROW_METHODS.getEscrow,
    args: { escrow_id: String(escrowId) },
  });
  return result ?? null;
}

export function parseNearU64ReturnValue(value: unknown): string {
  if (value === null || value === undefined) {
    throw new Error("Missing escrow id return value");
  }
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  if (typeof value === "object" && value !== null && "0" in value) {
    return String((value as { "0": string | number })["0"]);
  }
  throw new Error("Unexpected NEAR U64 return shape");
}

export function decodeJsonReturnFromBase64(base64: string): unknown {
  const raw = Buffer.from(base64, "base64").toString("utf8");
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

export { isMapEntryArray, normalizeTransactionOutcome } from "./transaction-outcome";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type ReceiptOutcomeNode = {
  id?: string;
  outcome?: { status?: unknown };
};

type CreateTxOutcomeNode = {
  status?: unknown;
  transaction_outcome?: { outcome?: { status?: unknown } };
  receipts_outcome?: ReceiptOutcomeNode[];
};

function successValueBase64FromStatus(status: unknown): string | null {
  if (typeof status !== "object" || status === null) {
    return null;
  }
  const value = (status as { SuccessValue?: unknown }).SuccessValue;
  return typeof value === "string" && value.length > 0 ? value : null;
}

function successReceiptIdFromStatus(status: unknown): string | null {
  if (typeof status !== "object" || status === null) {
    return null;
  }
  const value = (status as { SuccessReceiptId?: unknown }).SuccessReceiptId;
  return typeof value === "string" && value.length > 0 ? value : null;
}

function tryEscrowIdFromDecoded(decoded: unknown): string | null {
  try {
    return parseNearU64ReturnValue(decoded);
  } catch {
    return null;
  }
}

function resolveSuccessValueViaReceiptChain(
  status: unknown,
  receiptsById: Map<string, ReceiptOutcomeNode>,
): string | null {
  const visited = new Set<string>();
  let current: unknown = status;
  for (let depth = 0; depth < 32; depth += 1) {
    const direct = successValueBase64FromStatus(current);
    if (direct) {
      return direct;
    }
    const receiptId = successReceiptIdFromStatus(current);
    if (!receiptId || visited.has(receiptId)) {
      return null;
    }
    visited.add(receiptId);
    const receipt = receiptsById.get(receiptId);
    if (!receipt?.outcome?.status) {
      return null;
    }
    current = receipt.outcome.status;
  }
  return null;
}

function collectSuccessValueCandidates(outcome: unknown): string[] {
  if (!outcome || typeof outcome !== "object") {
    return [];
  }
  const root = outcome as CreateTxOutcomeNode;
  const receipts = root.receipts_outcome ?? [];
  const receiptsById = new Map<string, ReceiptOutcomeNode>();
  for (const receipt of receipts) {
    if (typeof receipt?.id === "string" && receipt.id.length > 0) {
      receiptsById.set(receipt.id, receipt);
    }
  }

  const candidates: string[] = [];
  const seen = new Set<string>();
  const add = (b64: string | null) => {
    if (b64 && !seen.has(b64)) {
      seen.add(b64);
      candidates.push(b64);
    }
  };

  add(successValueBase64FromStatus(root.status));
  add(resolveSuccessValueViaReceiptChain(root.status, receiptsById));
  add(
    resolveSuccessValueViaReceiptChain(
      root.transaction_outcome?.outcome?.status,
      receiptsById,
    ),
  );

  for (let i = receipts.length - 1; i >= 0; i -= 1) {
    const receiptStatus = receipts[i]?.outcome?.status;
    add(successValueBase64FromStatus(receiptStatus));
    add(resolveSuccessValueViaReceiptChain(receiptStatus, receiptsById));
  }

  return candidates;
}

/** Locate create_escrow return value in a final execution outcome. */
export function parseEscrowIdFromCreateOutcome(outcome: unknown): string {
  const normalized = normalizeTransactionOutcome(outcome);
  const fromLast = getTransactionLastResult(
    normalized as Parameters<typeof getTransactionLastResult>[0],
  );
  const lastId = tryEscrowIdFromDecoded(fromLast);
  if (lastId) {
    return lastId;
  }

  for (const b64 of collectSuccessValueCandidates(normalized)) {
    const id = tryEscrowIdFromDecoded(decodeJsonReturnFromBase64(b64));
    if (id) {
      return id;
    }
  }

  throw new Error("Could not parse escrow id from transaction outcome");
}

/** Parse escrow id from wallet and/or RPC execution outcomes (first match wins). */
export function resolveEscrowIdFromCreateOutcomes(
  ...outcomes: (unknown | undefined)[]
): string {
  for (const outcome of outcomes) {
    if (outcome == null) {
      continue;
    }
    try {
      return parseEscrowIdFromCreateOutcome(outcome);
    } catch {
      // try next source
    }
  }
  throw new Error("Could not parse escrow id from transaction outcome");
}

const DEFAULT_ESCROW_SCAN_MAX_ID = 512;

export async function findEscrowIdForEngagementByScan(
  config: EscrowNearConfig,
  engagementId: string,
  maxId = DEFAULT_ESCROW_SCAN_MAX_ID,
): Promise<string | null> {
  for (let id = maxId; id >= 1; id -= 1) {
    let record: OnChainEscrowRecord | null;
    try {
      record = await viewEscrowRecord(config, String(id));
    } catch {
      continue;
    }
    if (record?.engagement_id === engagementId) {
      return String(id);
    }
  }
  return null;
}

export async function viewActiveEscrowIdForEngagement(
  config: EscrowNearConfig,
  engagementId: string,
): Promise<string | null> {
  const contractId = requireEscrowContractId(config);
  const result = await createProvider(config).callFunction<unknown>({
    contractId,
    method: ESCROW_METHODS.getActiveEscrowIdForEngagement,
    args: { engagement_id: engagementId },
  });
  if (result === null || result === undefined) {
    return null;
  }
  return parseNearU64ReturnValue(result);
}

export async function resolveEscrowIdAfterCreateTx(
  config: EscrowNearConfig,
  engagementId: string,
  txHash: string,
  senderAccountIds: string | string[],
  claimedEscrowId?: string | null,
): Promise<string> {
  const trimmedClaim = claimedEscrowId?.trim() || null;
  const senders = Array.from(
    new Set(
      (Array.isArray(senderAccountIds)
        ? senderAccountIds
        : [senderAccountIds]
      )
        .map((id) => id.trim())
        .filter((id) => id.length > 0),
    ),
  );

  if (trimmedClaim) {
    try {
      const record = await viewEscrowRecord(config, trimmedClaim);
      if (record?.engagement_id === engagementId) {
        return trimmedClaim;
      }
    } catch {
      // claim invalid — continue resolving
    }
  }

  for (const sender of senders) {
    let rpcOutcome: unknown;
    try {
      rpcOutcome = await fetchTxFinalOutcome(config, txHash, sender);
    } catch {
      continue;
    }
    try {
      return parseEscrowIdFromCreateOutcome(rpcOutcome);
    } catch {
      // try next sender or fallbacks below
    }
  }

  let viewByEngagementSupported = true;
  for (let attempt = 0; attempt < 15; attempt += 1) {
    if (viewByEngagementSupported) {
      try {
        const id = await viewActiveEscrowIdForEngagement(config, engagementId);
        if (id) {
          return id;
        }
      } catch {
        viewByEngagementSupported = false;
      }
    }

    const scanned = await findEscrowIdForEngagementByScan(config, engagementId);
    if (scanned) {
      return scanned;
    }

    if (attempt < 14) {
      await delay(400);
    }
  }

  throw new Error("Could not resolve escrow id after create transaction");
}

export function assertEscrowRecordMatchesFunding(
  record: OnChainEscrowRecord,
  expected: FundingVerificationExpectation,
): void {
  if (record.engagement_id !== expected.engagementId) {
    throw new Error("On-chain engagement_id does not match");
  }
  if (record.requester !== expected.requesterNearAccountId) {
    throw new Error("On-chain requester does not match linked wallet");
  }
  if (record.provider !== expected.providerNearAccountId) {
    throw new Error("On-chain provider does not match");
  }

  const expectedAmount = smallestUnitsFromChainValue(expected.amountSmallestUnits);
  const onChainAmount = smallestUnitsFromChainValue(record.amount);
  if (onChainAmount !== expectedAmount) {
    throw new Error("On-chain amount does not match agreed offer");
  }

  if (expected.assetStandard === "native") {
    if (record.asset !== "Native") {
      throw new Error("Expected native escrow asset");
    }
  } else {
    if (record.asset !== "Nep141") {
      throw new Error("Expected NEP-141 escrow asset");
    }
    const expectedFt = expected.ftContractId?.trim() ?? "";
    const onChainFt = record.ft_contract?.trim() ?? "";
    if (!expectedFt || expectedFt !== onChainFt) {
      throw new Error("On-chain FT contract does not match asset registry");
    }
  }
}

export async function fetchTxFinalOutcome(
  config: EscrowNearConfig,
  txHash: string,
  accountId: string,
): Promise<unknown> {
  const provider = createProvider(config);
  const statusQuery = {
    txHash,
    accountId,
    waitUntil: "EXECUTED_OPTIMISTIC" as const,
  };
  if (
    "viewTransactionStatusWithReceipts" in provider &&
    typeof provider.viewTransactionStatusWithReceipts === "function"
  ) {
    return provider.viewTransactionStatusWithReceipts(statusQuery);
  }
  if (
    "viewTransactionStatus" in provider &&
    typeof provider.viewTransactionStatus === "function"
  ) {
    return provider.viewTransactionStatus(statusQuery);
  }
  const legacy = provider as {
    txStatus?: (hash: string, senderAccountId: string) => Promise<unknown>;
  };
  if (typeof legacy.txStatus === "function") {
    return legacy.txStatus(txHash, accountId);
  }
  throw new Error("NEAR provider does not support transaction status queries");
}

export function assertFundingCompleteOnChain(
  record: OnChainEscrowRecord,
  expected: FundingVerificationExpectation,
): void {
  assertEscrowRecordMatchesFunding(record, expected);
  if (record.status !== "Funded") {
    throw new Error(`Escrow is not funded (status ${record.status})`);
  }
  const deposited = smallestUnitsFromChainValue(record.deposited);
  const amount = smallestUnitsFromChainValue(record.amount);
  if (deposited !== amount) {
    throw new Error("Escrow deposited amount does not match");
  }
}

export function explorerTransactionUrl(
  networkId: "localnet" | "testnet" | "mainnet",
  txHash: string,
): string | null {
  if (networkId === "localnet") {
    return null;
  }
  const host =
    networkId === "testnet"
      ? "https://testnet.nearblocks.io"
      : "https://nearblocks.io";
  return `${host}/txns/${txHash}`;
}
