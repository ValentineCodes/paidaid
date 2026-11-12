import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Tables } from "../database.types";
import { chainIdForCurrentNearNetwork } from "../near/escrow-config";

export type RequestCreateCatalog = {
  assets: Tables<"assets">[];
  tags: Tables<"tags">[];
  defaultAssetId: string;
};

/** Prefer native NEAR when enabled on the current network (unchanged when USDC is added). */
export function resolveDefaultBudgetAssetId(
  networkAssets: Pick<
    Tables<"assets">,
    "id" | "asset_standard" | "native_reference"
  >[],
): string {
  if (networkAssets.length === 0) {
    throw new Error("No enabled assets for network.");
  }
  const nativeNear = networkAssets.find(
    (a) => a.asset_standard === "native" && a.native_reference === "near",
  );
  return nativeNear?.id ?? networkAssets[0]!.id;
}

export async function loadRequestCreateCatalog(
  supabase: SupabaseClient<Database>,
): Promise<RequestCreateCatalog | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return null;
  }

  const [
    { data: assets, error: assetsError },
    { data: tags, error: tagsError },
  ] = await Promise.all([
    supabase.from("assets").select("*").order("canonical_asset_key"),
    supabase.from("tags").select("*").order("category").order("sort_order"),
  ]);

  if (assetsError || tagsError || !assets?.length || !tags?.length) {
    throw new Error(
      assetsError?.message ??
        tagsError?.message ??
        "Could not load catalogue data.",
    );
  }

  const chainId = chainIdForCurrentNearNetwork();
  const networkAssets = assets.filter(
    (a) => a.enabled && a.chain_id === chainId,
  );
  if (networkAssets.length === 0) {
    throw new Error(
      `No enabled assets for ${chainId}. Check NEAR_NETWORK_ID and database seeds.`,
    );
  }

  const defaultAssetId = resolveDefaultBudgetAssetId(networkAssets);

  return {
    assets: networkAssets,
    tags,
    defaultAssetId,
  };
}
