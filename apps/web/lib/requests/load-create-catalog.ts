import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Tables } from "../database.types";

export type RequestCreateCatalog = {
  assets: Tables<"assets">[];
  tags: Tables<"tags">[];
  defaultAssetId: string;
};

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

  return {
    assets,
    tags,
    defaultAssetId: assets[0].id,
  };
}
