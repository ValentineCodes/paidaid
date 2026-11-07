import {
  formatSmallestUnits,
  type NearNetworkId,
  type TrustedAssetRow,
  resolveAssetContractId,
} from "@paidaid/shared";
import { createProvider, readAssetBalance } from "@paidaid/near";

import { readAlignedNearRuntimeConfig } from "./runtime-config";
import {
  balanceCacheKey,
  readBalanceCache,
  writeBalanceCache,
} from "./balance-read-cache";

export type LinkedAssetBalanceLine = {
  assetId: string;
  symbol: string;
  assetStandard: TrustedAssetRow["asset_standard"];
  decimals: number;
  canonicalAssetKey: string;
  smallestUnits: string | null;
  displayAmount: string | null;
  status: "ok" | "rpc_error" | "unavailable";
  message?: string;
};

export type LinkedWalletBalancesSnapshot = {
  networkId: NearNetworkId;
  nearAccountId: string;
  lines: LinkedAssetBalanceLine[];
  fetchedAt: string;
  fromCache: boolean;
  disclaimer: string;
};

const BALANCE_DISCLAIMER =
  "Balances are indicative RPC reads, not payment or escrow evidence.";

export async function readLinkedWalletBalances(input: {
  nearAccountId: string;
  assets: TrustedAssetRow[];
  networkId?: NearNetworkId;
  skipCache?: boolean;
}): Promise<LinkedWalletBalancesSnapshot> {
  const config = readAlignedNearRuntimeConfig();
  const networkId = input.networkId ?? config.networkId;

  const cacheKey = balanceCacheKey([
    networkId,
    input.nearAccountId.toLowerCase(),
    input.assets.map((a) => a.canonical_asset_key).join(","),
  ]);

  if (!input.skipCache) {
    const cached = readBalanceCache<LinkedWalletBalancesSnapshot>(cacheKey);
    if (cached) {
      return { ...cached, fromCache: true };
    }
  }

  const provider = createProvider(config);
  const lines: LinkedAssetBalanceLine[] = [];

  for (const asset of input.assets) {
    const contractId = resolveAssetContractId(asset);
    const result = await readAssetBalance(
      config,
      input.nearAccountId,
      {
        assetStandard: asset.asset_standard,
        tokenContractId: contractId,
      },
      provider,
    );

    if (result.status === "ok" && result.smallestUnits != null) {
      lines.push({
        assetId: asset.id,
        symbol: asset.symbol,
        assetStandard: asset.asset_standard,
        decimals: asset.decimals,
        canonicalAssetKey: asset.canonical_asset_key,
        smallestUnits: result.smallestUnits,
        displayAmount: formatSmallestUnits(result.smallestUnits, asset.decimals),
        status: "ok",
      });
      continue;
    }

    lines.push({
      assetId: asset.id,
      symbol: asset.symbol,
      assetStandard: asset.asset_standard,
      decimals: asset.decimals,
      canonicalAssetKey: asset.canonical_asset_key,
      smallestUnits: null,
      displayAmount: null,
      status: result.status === "rpc_error" ? "rpc_error" : "unavailable",
      message: result.message,
    });
  }

  const snapshot: LinkedWalletBalancesSnapshot = {
    networkId,
    nearAccountId: input.nearAccountId,
    lines,
    fetchedAt: new Date().toISOString(),
    fromCache: false,
    disclaimer: BALANCE_DISCLAIMER,
  };

  writeBalanceCache(cacheKey, snapshot);
  return snapshot;
}
