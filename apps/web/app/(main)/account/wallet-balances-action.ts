"use server";

import {
  chainIdFromNetwork,
  validateTrustedAssetRow,
  type TrustedAssetRow,
} from "@paidaid/shared";

import { readAlignedNearRuntimeConfig } from "../../../lib/near/runtime-config";
import {
  readLinkedWalletBalances,
  type LinkedAssetBalanceLine,
  type LinkedWalletBalancesSnapshot,
} from "../../../lib/near/read-linked-balances";
import { loadActiveLinkedNearWallet } from "../../../lib/near/load-linked-wallet";
import { loadTrustedEnabledAssets } from "../../../lib/near/trusted-assets";
import { createClient } from "../../../lib/supabase/server";

export type WalletBalancesActionResult =
  | { ok: true; snapshot: LinkedWalletBalancesSnapshot }
  | { ok: false; error: string; code: "not_linked" | "config" | "assets" | "unknown" };

export async function fetchLinkedWalletBalances(options?: {
  refresh?: boolean;
}): Promise<WalletBalancesActionResult> {
  let config;
  try {
    config = readAlignedNearRuntimeConfig();
  } catch (e) {
    return {
      ok: false,
      code: "config",
      error: e instanceof Error ? e.message : "NEAR configuration error.",
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, code: "unknown", error: "Sign in to view balances." };
  }

  const linked = await loadActiveLinkedNearWallet(supabase, user.id);
  if (!linked) {
    return {
      ok: false,
      code: "not_linked",
      error: "Link a NEAR wallet to your PaidAid account first.",
    };
  }

  const { assets, error: assetsError } = await loadTrustedEnabledAssets(
    supabase,
    config.networkId,
  );
  if (assetsError) {
    return { ok: false, code: "assets", error: assetsError };
  }
  if (assets.length === 0) {
    return {
      ok: false,
      code: "assets",
      error: "No enabled assets for this network.",
    };
  }

  const snapshot = await readLinkedWalletBalances({
    nearAccountId: linked.nearAccountId,
    assets,
    networkId: config.networkId,
    skipCache: options?.refresh === true,
  });

  return { ok: true, snapshot };
}

export type LinkedAssetBalanceResult =
  | {
      ok: true;
      line: LinkedAssetBalanceLine;
      nearAccountId: string;
      networkId: string;
    }
  | {
      ok: false;
      code: "not_linked" | "config" | "assets" | "rpc" | "unknown";
      error: string;
    };

export async function fetchLinkedWalletBalanceForAsset(
  assetId: string,
  options?: { refresh?: boolean },
): Promise<LinkedAssetBalanceResult> {
  const trimmedId = assetId.trim();
  if (!trimmedId) {
    return { ok: false, code: "assets", error: "Select an asset." };
  }

  let config;
  try {
    config = readAlignedNearRuntimeConfig();
  } catch (e) {
    return {
      ok: false,
      code: "config",
      error: e instanceof Error ? e.message : "NEAR configuration error.",
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, code: "unknown", error: "Sign in to view balances." };
  }

  const linked = await loadActiveLinkedNearWallet(supabase, user.id);
  if (!linked) {
    return {
      ok: false,
      code: "not_linked",
      error: "Link a NEAR wallet to your PaidAid account first.",
    };
  }

  const chainId = chainIdFromNetwork(config.networkId);
  const { data: row, error } = await supabase
    .from("assets")
    .select(
      "id, chain_id, asset_standard, native_reference, token_contract_id, symbol, decimals, canonical_asset_key, enabled",
    )
    .eq("id", trimmedId)
    .eq("chain_id", chainId)
    .eq("enabled", true)
    .maybeSingle();

  if (error || !row) {
    return {
      ok: false,
      code: "assets",
      error: "Asset is not available on this network.",
    };
  }

  const asset: TrustedAssetRow = {
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
  const validationError = validateTrustedAssetRow(asset, config.networkId);
  if (validationError) {
    return { ok: false, code: "assets", error: validationError };
  }

  const snapshot = await readLinkedWalletBalances({
    nearAccountId: linked.nearAccountId,
    assets: [asset],
    networkId: config.networkId,
    skipCache: options?.refresh === true,
  });

  const line = snapshot.lines[0];
  if (!line) {
    return { ok: false, code: "rpc", error: "Could not read balance." };
  }
  if (line.status !== "ok") {
    return {
      ok: false,
      code: line.status === "rpc_error" ? "rpc" : "unknown",
      error: line.message ?? "Balance unavailable.",
    };
  }

  return {
    ok: true,
    line,
    nearAccountId: linked.nearAccountId,
    networkId: config.networkId,
  };
}
