"use server";

import { readAlignedNearRuntimeConfig } from "../../../lib/near/runtime-config";
import {
  readLinkedWalletBalances,
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
