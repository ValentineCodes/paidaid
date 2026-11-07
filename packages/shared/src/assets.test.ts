import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCanonicalAssetKey,
  findTrustedAssetByContract,
  validateTrustedAssetRow,
} from "./assets.ts";

const nativeLocal: import("./assets.ts").TrustedAssetRow = {
  id: "1",
  chain_id: "near:localnet",
  asset_standard: "native",
  native_reference: "near",
  token_contract_id: null,
  symbol: "NEAR",
  decimals: 24,
  canonical_asset_key: "near:localnet:native:near",
  enabled: true,
};

test("validateTrustedAssetRow accepts native localnet", () => {
  assert.equal(validateTrustedAssetRow(nativeLocal, "localnet"), null);
});

test("validateTrustedAssetRow rejects network mismatch", () => {
  assert.match(
    validateTrustedAssetRow(nativeLocal, "mainnet") ?? "",
    /network mismatch/i,
  );
});

test("findTrustedAssetByContract ignores disabled or wrong network", () => {
  const ft: import("./assets.ts").TrustedAssetRow = {
    ...nativeLocal,
    id: "2",
    asset_standard: "nep141",
    native_reference: null,
    token_contract_id: "wrap.testnet",
    symbol: "wNEAR",
    canonical_asset_key: "near:testnet:nep141:wrap.testnet",
    chain_id: "near:testnet",
  };
  assert.equal(
    findTrustedAssetByContract([ft], "wrap.testnet", "localnet"),
    null,
  );
  assert.equal(
    findTrustedAssetByContract([ft], "wrap.testnet", "testnet")?.symbol,
    "wNEAR",
  );
});

test("buildCanonicalAssetKey encodes standard", () => {
  assert.equal(
    buildCanonicalAssetKey({
      networkId: "testnet",
      assetStandard: "nep141",
      tokenContractId: "wrap.testnet",
    }),
    "near:testnet:nep141:wrap.testnet",
  );
});
