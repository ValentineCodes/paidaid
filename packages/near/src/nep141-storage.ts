import {
  normalizeNearAccountId,
  parseSmallestUnitsString,
  validateNearAccountId,
  validateNep141ContractId,
  type NearConfig,
} from "@paidaid/shared";
import type { JsonRpcProvider } from "near-api-js";

import { createProvider } from "./rpc";
import { withRpcTimeout } from "./rpc-timeout";

export type Nep141StorageReadStatus =
  | "ok"
  | "rpc_error"
  | "invalid_account"
  | "invalid_asset";

export type Nep141StorageBalance = {
  total: string;
  available: string;
};

export type Nep141StorageBounds = {
  /** Minimum NEAR (yocto) attached for registration. */
  minYocto: string;
  /** Max deposit when present (yocto). */
  maxYocto: string | null;
};

export type Nep141StorageBalanceResult = {
  status: Nep141StorageReadStatus;
  registered: boolean;
  balance: Nep141StorageBalance | null;
  message?: string;
};

export type Nep141StorageBoundsResult = {
  status: Nep141StorageReadStatus;
  bounds: Nep141StorageBounds | null;
  message?: string;
};

type StorageBalanceRaw = {
  total?: string;
  available?: string;
};

type StorageBoundsRaw = {
  min?: string;
  max?: string | null;
};

function parseStorageBalanceRaw(raw: unknown): Nep141StorageBalance | null {
  if (raw == null) {
    return null;
  }
  if (typeof raw !== "object") {
    return null;
  }
  const row = raw as StorageBalanceRaw;
  if (typeof row.total !== "string" || typeof row.available !== "string") {
    return null;
  }
  if (!/^\d+$/.test(row.total) || !/^\d+$/.test(row.available)) {
    return null;
  }
  return { total: row.total, available: row.available };
}

export function isNep141AccountRegistered(
  balance: Nep141StorageBalance | null,
): boolean {
  return balance !== null;
}

function parseBoundsYocto(raw: unknown): string | null {
  if (typeof raw === "string" && /^\d+$/.test(raw.trim())) {
    return raw.trim();
  }
  if (typeof raw === "object" && raw !== null && "0" in raw) {
    const v = (raw as { "0": string })["0"];
    return typeof v === "string" && /^\d+$/.test(v) ? v : null;
  }
  return null;
}

export function parseNep141StorageBoundsRaw(
  raw: unknown,
): Nep141StorageBounds | null {
  if (raw == null || typeof raw !== "object") {
    return null;
  }
  const row = raw as StorageBoundsRaw;
  const min =
    parseBoundsYocto(row.min) ??
    (typeof row.min === "string" ? parseBoundsYocto(row.min) : null);
  if (!min) {
    return null;
  }
  const max =
    row.max == null
      ? null
      : parseBoundsYocto(row.max) ??
        (typeof row.max === "string" ? parseBoundsYocto(row.max) : null);
  return { minYocto: min, maxYocto: max };
}

export async function readNep141StorageBounds(
  config: NearConfig,
  tokenContractId: string,
  provider?: JsonRpcProvider,
): Promise<Nep141StorageBoundsResult> {
  const contractErr = validateNep141ContractId(tokenContractId);
  if (contractErr) {
    return { status: "invalid_asset", bounds: null, message: contractErr };
  }
  const p = provider ?? createProvider(config);
  try {
    const raw = await withRpcTimeout(
      p.callFunction<StorageBoundsRaw>({
        contractId: tokenContractId.trim(),
        method: "storage_balance_bounds",
        args: {},
      }),
    );
    const bounds = parseNep141StorageBoundsRaw(raw);
    if (!bounds) {
      return {
        status: "rpc_error",
        bounds: null,
        message: "storage_balance_bounds returned unexpected shape.",
      };
    }
    return { status: "ok", bounds };
  } catch (error) {
    return {
      status: "rpc_error",
      bounds: null,
      message: error instanceof Error ? error.message : "RPC error.",
    };
  }
}

export async function readNep141StorageBalanceOf(
  config: NearConfig,
  tokenContractId: string,
  accountId: string,
  provider?: JsonRpcProvider,
): Promise<Nep141StorageBalanceResult> {
  const accountErr = validateNearAccountId(accountId);
  if (accountErr) {
    return {
      status: "invalid_account",
      registered: false,
      balance: null,
      message: accountErr,
    };
  }
  const contractErr = validateNep141ContractId(tokenContractId);
  if (contractErr) {
    return {
      status: "invalid_asset",
      registered: false,
      balance: null,
      message: contractErr,
    };
  }
  const p = provider ?? createProvider(config);
  try {
    const raw = await withRpcTimeout(
      p.callFunction<StorageBalanceRaw | Record<string, never>>({
        contractId: tokenContractId.trim(),
        method: "storage_balance_of",
        args: { account_id: accountId.trim() },
      }),
    );
    const balance = parseStorageBalanceRaw(raw);
    return {
      status: "ok",
      registered: isNep141AccountRegistered(balance),
      balance,
    };
  } catch (error) {
    return {
      status: "rpc_error",
      registered: false,
      balance: null,
      message: error instanceof Error ? error.message : "RPC error.",
    };
  }
}

/** Determine if `expectedContract` matches trusted registry id (case-insensitive). */
export function assertTokenContractMatchesRegistry(
  tokenContractId: string,
  registryTokenContractId: string | null,
): boolean {
  if (!registryTokenContractId?.trim()) {
    return false;
  }
  return (
    normalizeNearAccountId(tokenContractId) ===
    normalizeNearAccountId(registryTokenContractId)
  );
}

export function storageDepositYoctoForRegistration(
  bounds: Nep141StorageBounds,
): string {
  const min = parseSmallestUnitsString(bounds.minYocto);
  if (min == null) {
    throw new Error("Invalid storage minimum from token contract.");
  }
  if (bounds.maxYocto) {
    const max = parseSmallestUnitsString(bounds.maxYocto);
    if (max != null && min > max) {
      throw new Error("Token storage bounds are inconsistent.");
    }
  }
  return bounds.minYocto;
}
