import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../database.types";

export type LinkedNearWalletRow = {
  nearAccountId: string;
  publicKey: string;
  linkedAt: string;
  walletProviderId: string | null;
};

export async function loadActiveLinkedNearWallet(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<LinkedNearWalletRow | null> {
  const { data, error } = await supabase
    .from("linked_near_wallets")
    .select("near_account_id, public_key, linked_at, wallet_provider_id")
    .eq("user_id", userId)
    .is("unlinked_at", null)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return {
    nearAccountId: data.near_account_id,
    publicKey: data.public_key,
    linkedAt: data.linked_at,
    walletProviderId: data.wallet_provider_id ?? null,
  };
}
