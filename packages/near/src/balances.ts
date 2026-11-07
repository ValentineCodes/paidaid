import {
  bigintToSmallestUnitsString,
  type AssetStandard,
  type NearConfig,
  validateNearAccountId,
  validateNep141ContractId,
} from "@paidaid/shared";
import type { JsonRpcProvider } from "near-api-js";

import { createProvider } from "./rpc";
import { withRpcTimeout } from "./rpc-timeout";

export type BalanceReadStatus = "ok" | "rpc_error" | "invalid_account" | "invalid_asset";

export type NativeBalanceResult = {
  status: BalanceReadStatus;
  /** Smallest units (yoctoNEAR) as decimal string when status is ok. */
  smallestUnits: string | null;
  message?: string;
};

export type FtBalanceResult = NativeBalanceResult;

export type FtMetadataResult =
  | { status: "ok"; symbol: string; decimals: number }
  | { status: "rpc_error"; message: string }
  | { status: "invalid_asset"; message: string };

type FtMetadataRaw = {
  symbol?: string;
  decimals?: number;
};

type FtBalanceRaw = string;

function normalizeAmountRaw(raw: bigint | string): string {
  if (typeof raw === "bigint") {
    return bigintToSmallestUnitsString(raw);
  }
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) {
    throw new Error("Unexpected balance format from RPC.");
  }
  return trimmed;
}

export async function readNativeNearBalance(
  config: NearConfig,
  accountId: string,
  provider?: JsonRpcProvider,
): Promise<NativeBalanceResult> {
  const accountErr = validateNearAccountId(accountId);
  if (accountErr) {
    return { status: "invalid_account", smallestUnits: null, message: accountErr };
  }

  const p = provider ?? createProvider(config);
  try {
    const view = await withRpcTimeout(
      p.viewAccount({ accountId: accountId.trim() }),
    );
    return {
      status: "ok",
      smallestUnits: normalizeAmountRaw(view.amount),
    };
  } catch (error) {
    return {
      status: "rpc_error",
      smallestUnits: null,
      message: error instanceof Error ? error.message : "RPC error.",
    };
  }
}

export async function readNep141Metadata(
  config: NearConfig,
  contractId: string,
  provider?: JsonRpcProvider,
): Promise<FtMetadataResult> {
  const contractErr = validateNep141ContractId(contractId);
  if (contractErr) {
    return { status: "invalid_asset", message: contractErr };
  }

  const p = provider ?? createProvider(config);
  try {
    const meta = await withRpcTimeout(
      p.callFunction<FtMetadataRaw>({
        contractId: contractId.trim(),
        method: "ft_metadata",
        args: {},
      }),
    );
    if (
      typeof meta?.symbol !== "string" ||
      typeof meta.decimals !== "number" ||
      !Number.isInteger(meta.decimals) ||
      meta.decimals < 0
    ) {
      return {
        status: "rpc_error",
        message: "ft_metadata returned unexpected shape.",
      };
    }
    return { status: "ok", symbol: meta.symbol, decimals: meta.decimals };
  } catch (error) {
    return {
      status: "rpc_error",
      message: error instanceof Error ? error.message : "RPC error.",
    };
  }
}

export async function readNep141Balance(
  config: NearConfig,
  contractId: string,
  accountId: string,
  provider?: JsonRpcProvider,
): Promise<FtBalanceResult> {
  const accountErr = validateNearAccountId(accountId);
  if (accountErr) {
    return { status: "invalid_account", smallestUnits: null, message: accountErr };
  }
  const contractErr = validateNep141ContractId(contractId);
  if (contractErr) {
    return { status: "invalid_asset", smallestUnits: null, message: contractErr };
  }

  const p = provider ?? createProvider(config);
  try {
    const balance = await withRpcTimeout(
      p.callFunction<FtBalanceRaw>({
        contractId: contractId.trim(),
        method: "ft_balance_of",
        args: { account_id: accountId.trim() },
      }),
    );
    if (balance == null) {
      return {
        status: "rpc_error",
        smallestUnits: null,
        message: "ft_balance_of returned no result.",
      };
    }
    return {
      status: "ok",
      smallestUnits: normalizeAmountRaw(balance),
    };
  } catch (error) {
    return {
      status: "rpc_error",
      smallestUnits: null,
      message: error instanceof Error ? error.message : "RPC error.",
    };
  }
}

export type AssetBalanceRequest = {
  assetStandard: AssetStandard;
  tokenContractId?: string | null;
};

export async function readAssetBalance(
  config: NearConfig,
  accountId: string,
  asset: AssetBalanceRequest,
  provider?: JsonRpcProvider,
): Promise<NativeBalanceResult> {
  if (asset.assetStandard === "native") {
    return readNativeNearBalance(config, accountId, provider);
  }
  if (!asset.tokenContractId?.trim()) {
    return {
      status: "invalid_asset",
      smallestUnits: null,
      message: "Missing token contract for NEP-141 balance.",
    };
  }
  return readNep141Balance(config, asset.tokenContractId, accountId, provider);
}
