import assert from "node:assert/strict";
import test from "node:test";

import {
  CIRCLE_NATIVE_USDC_TESTNET_CONTRACT_ID,
  circleNativeUsdcCanonicalAssetKey,
} from "@paidaid/shared";

import type { Tables } from "../database.types";
import { resolveDefaultBudgetAssetId } from "./load-create-catalog";

function asset(
  partial: Pick<
    Tables<"assets">,
    "id" | "asset_standard" | "native_reference" | "symbol" | "enabled"
  > &
    Partial<Pick<Tables<"assets">, "token_contract_id" | "canonical_asset_key">>,
): Pick<
  Tables<"assets">,
  "id" | "asset_standard" | "native_reference"
> {
  return {
    id: partial.id,
    asset_standard: partial.asset_standard,
    native_reference: partial.native_reference,
  };
}

test("resolveDefaultBudgetAssetId prefers native NEAR when USDC is enabled", () => {
  const nearId = "near-native-id";
  const usdcId = "usdc-id";
  const catalog = [
    asset({
      id: usdcId,
      asset_standard: "nep141",
      native_reference: null,
      symbol: "USDC",
      enabled: true,
      token_contract_id: CIRCLE_NATIVE_USDC_TESTNET_CONTRACT_ID,
      canonical_asset_key: circleNativeUsdcCanonicalAssetKey("testnet"),
    }),
    asset({
      id: nearId,
      asset_standard: "native",
      native_reference: "near",
      symbol: "NEAR",
      enabled: true,
    }),
  ];
  assert.equal(resolveDefaultBudgetAssetId(catalog), nearId);
});

test("network asset filter excludes disabled fake USDC from default selection", () => {
  const enabledOnly = [
    asset({
      id: "near",
      asset_standard: "native",
      native_reference: "near",
      symbol: "NEAR",
      enabled: true,
    }),
    asset({
      id: "circle-usdc",
      asset_standard: "nep141",
      native_reference: null,
      symbol: "USDC",
      enabled: true,
      token_contract_id: CIRCLE_NATIVE_USDC_TESTNET_CONTRACT_ID,
    }),
  ];
  const defaultId = resolveDefaultBudgetAssetId(enabledOnly);
  assert.equal(defaultId, "near");
});
