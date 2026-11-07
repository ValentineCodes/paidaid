import type { SupabaseClient } from "@supabase/supabase-js";
import {
  chainIdFromNetwork,
  type NearNetworkId,
  type TrustedAssetRow,
  validateTrustedAssetRow,
} from "@paidaid/shared";

import type { Database } from "../database.types";

function mapAssetRow(
  row: Pick<
    Database["public"]["Tables"]["assets"]["Row"],
    | "id"
    | "chain_id"
    | "asset_standard"
    | "native_reference"
    | "token_contract_id"
    | "symbol"
    | "decimals"
    | "canonical_asset_key"
    | "enabled"
  >,
): TrustedAssetRow {
  return {
    id: row.id,
    chain_id: row.chain_id,
    asset_standard: row.asset_standard,
    native_reference: row.native_reference,
    token_contract_id: row.token_contract_id,
    symbol: row.symbol,
    decimals: row.decimals,
    canonical_asset_key: row.canonical_asset_key,
    enabled: row.enabled,
  };
}

export async function loadTrustedEnabledAssets(
  supabase: SupabaseClient<Database>,
  networkId: NearNetworkId,
): Promise<{ assets: TrustedAssetRow[]; error: string | null }> {
  const chainId = chainIdFromNetwork(networkId);
  const { data, error } = await supabase
    .from("assets")
    .select(
      "id, chain_id, asset_standard, native_reference, token_contract_id, symbol, decimals, canonical_asset_key, enabled",
    )
    .eq("chain_id", chainId)
    .eq("enabled", true)
    .order("canonical_asset_key");

  if (error) {
    return { assets: [], error: error.message };
  }

  const assets: TrustedAssetRow[] = [];
  for (const row of data ?? []) {
    const mapped = mapAssetRow(row);
    const err = validateTrustedAssetRow(mapped, networkId);
    if (err) {
      continue;
    }
    assets.push(mapped);
  }

  return { assets, error: null };
}
