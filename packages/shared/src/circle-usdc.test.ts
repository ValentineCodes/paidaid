import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCanonicalAssetKey,
  findTrustedAssetByContract,
  validateTrustedAssetRow,
} from "./assets.ts";
import {
  CIRCLE_NATIVE_USDC_DECIMALS,
  CIRCLE_NATIVE_USDC_MAINNET_CONTRACT_ID,
  CIRCLE_NATIVE_USDC_SYMBOL,
  CIRCLE_NATIVE_USDC_TESTNET_CONTRACT_ID,
  LEGACY_TESTNET_FAKE_USDC_CONTRACT_ID,
  circleNativeUsdcCanonicalAssetKey,
  circleNativeUsdcForNearNetwork,
  circleNativeUsdcTokenContractId,
} from "./circle-usdc.ts";

test("Circle USDC registry constants match verified Circle addresses", () => {
  assert.equal(CIRCLE_NATIVE_USDC_SYMBOL, "USDC");
  assert.equal(CIRCLE_NATIVE_USDC_DECIMALS, 6);
  assert.equal(
    circleNativeUsdcTokenContractId("mainnet"),
    CIRCLE_NATIVE_USDC_MAINNET_CONTRACT_ID,
  );
  assert.equal(
    circleNativeUsdcTokenContractId("testnet"),
    CIRCLE_NATIVE_USDC_TESTNET_CONTRACT_ID,
  );
  assert.match(CIRCLE_NATIVE_USDC_MAINNET_CONTRACT_ID, /^[a-f0-9]{64}$/);
  assert.match(CIRCLE_NATIVE_USDC_TESTNET_CONTRACT_ID, /^[a-f0-9]{64}$/);
});

test("canonical asset keys align with buildCanonicalAssetKey", () => {
  assert.equal(
    circleNativeUsdcCanonicalAssetKey("mainnet"),
    buildCanonicalAssetKey({
      networkId: "mainnet",
      assetStandard: "nep141",
      tokenContractId: CIRCLE_NATIVE_USDC_MAINNET_CONTRACT_ID,
    }),
  );
  assert.equal(
    circleNativeUsdcCanonicalAssetKey("testnet"),
    buildCanonicalAssetKey({
      networkId: "testnet",
      assetStandard: "nep141",
      tokenContractId: CIRCLE_NATIVE_USDC_TESTNET_CONTRACT_ID,
    }),
  );
});

test("circleNativeUsdcForNearNetwork excludes localnet", () => {
  assert.equal(circleNativeUsdcForNearNetwork("localnet"), null);
  assert.notEqual(circleNativeUsdcForNearNetwork("testnet"), null);
});

test("enabled Circle USDC row validates on its network", () => {
  const row: import("./assets.ts").TrustedAssetRow = {
    id: "usdc-test",
    chain_id: "near:testnet",
    asset_standard: "nep141",
    native_reference: null,
    token_contract_id: CIRCLE_NATIVE_USDC_TESTNET_CONTRACT_ID,
    symbol: CIRCLE_NATIVE_USDC_SYMBOL,
    decimals: CIRCLE_NATIVE_USDC_DECIMALS,
    canonical_asset_key: circleNativeUsdcCanonicalAssetKey("testnet"),
    enabled: true,
  };
  assert.equal(validateTrustedAssetRow(row, "testnet"), null);
  assert.equal(
    findTrustedAssetByContract(
      [row],
      CIRCLE_NATIVE_USDC_TESTNET_CONTRACT_ID,
      "testnet",
    )?.canonical_asset_key,
    circleNativeUsdcCanonicalAssetKey("testnet"),
  );
});

test("legacy fake testnet USDC is distinct from Circle testnet contract", () => {
  assert.notEqual(
    LEGACY_TESTNET_FAKE_USDC_CONTRACT_ID,
    CIRCLE_NATIVE_USDC_TESTNET_CONTRACT_ID,
  );
});
