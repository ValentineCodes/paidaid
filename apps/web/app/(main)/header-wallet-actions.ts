"use server";

import { readNativeNearBalance } from "@paidaid/near";

import { readAlignedNearRuntimeConfig } from "../../lib/near/runtime-config";
import { loadActiveLinkedNearWallet } from "../../lib/near/load-linked-wallet";
import { formatHeaderNearBalanceFromYocto } from "../../lib/wallet/format-header-near-balance";
import { nearAccountsMatch } from "../../lib/wallet/header-display";
import { createClient } from "../../lib/supabase/server";
import { readPublicNearNetworkId } from "../../wallet/network-config";

export type HeaderNativeBalanceResult =
  | {
      ok: true;
      nearAccountId: string;
      networkId: string;
      smallestUnits: string;
      displayAmount: string;
      fetchedAt: string;
    }
  | { ok: false; error: string; code: "signed_out" | "mismatch" | "config" | "rpc" };

export async function fetchHeaderNativeNearBalance(
  options?: { forAccountId?: string; refresh?: boolean },
): Promise<HeaderNativeBalanceResult> {
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
    return { ok: false, code: "signed_out", error: "Not signed in." };
  }

  const linked = await loadActiveLinkedNearWallet(supabase, user.id);
  if (!linked) {
    return { ok: false, code: "signed_out", error: "No wallet on this profile." };
  }

  const requested = options?.forAccountId?.trim();
  if (requested && !nearAccountsMatch(requested, linked.nearAccountId)) {
    return {
      ok: false,
      code: "mismatch",
      error: "Connected wallet does not match your signed-in account.",
    };
  }

  void options?.refresh;

  const balance = await readNativeNearBalance(config, linked.nearAccountId);
  if (balance.status === "invalid_account") {
    const formatted = formatHeaderNearBalanceFromYocto("0");
    if (formatted.status !== "ok") {
      return {
        ok: false,
        code: "rpc",
        error: "message" in formatted ? formatted.message : "Could not format balance.",
      };
    }
    return {
      ok: true,
      nearAccountId: linked.nearAccountId,
      networkId: readPublicNearNetworkId(process.env),
      smallestUnits: "0",
      displayAmount: formatted.display,
      fetchedAt: new Date().toISOString(),
    };
  }
  if (balance.status !== "ok" || balance.smallestUnits == null) {
    return {
      ok: false,
      code: "rpc",
      error: balance.message ?? "RPC error while reading balance.",
    };
  }

  const formatted = formatHeaderNearBalanceFromYocto(balance.smallestUnits);
  if (formatted.status !== "ok") {
    return {
      ok: false,
      code: "rpc",
      error: "message" in formatted ? formatted.message : "Could not format balance.",
    };
  }

  return {
    ok: true,
    nearAccountId: linked.nearAccountId,
    networkId: readPublicNearNetworkId(process.env),
    smallestUnits: balance.smallestUnits,
    displayAmount: formatted.display,
    fetchedAt: new Date().toISOString(),
  };
}
