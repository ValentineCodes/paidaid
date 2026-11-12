import assert from "node:assert/strict";
import test from "node:test";

import {
  filterTaskBudgetAssetOptions,
  resolveSelectedBudgetAssetId,
  validateBudgetAssetForCreate,
} from "./request-budget-assets";

test("filterTaskBudgetAssetOptions keeps NEAR and USDC, orders NEAR first", () => {
  const filtered = filterTaskBudgetAssetOptions([
    {
      id: "usdc",
      symbol: "USDC",
      decimals: 6,
      asset_standard: "nep141",
    },
    {
      id: "wnear",
      symbol: "wNEAR",
      decimals: 24,
      asset_standard: "nep141",
    },
    {
      id: "near",
      symbol: "NEAR",
      decimals: 24,
      asset_standard: "native",
    },
    {
      id: "usdt",
      symbol: "USDT",
      decimals: 6,
      asset_standard: "nep141",
    },
  ]);
  assert.equal(filtered.length, 2);
  assert.equal(filtered[0]!.symbol, "NEAR");
  assert.equal(filtered[1]!.symbol, "USDC");
});

test("resolveSelectedBudgetAssetId falls back to default then first option", () => {
  const options = filterTaskBudgetAssetOptions([
    { id: "near", symbol: "NEAR", decimals: 24, asset_standard: "native" },
    { id: "usdc", symbol: "USDC", decimals: 6, asset_standard: "nep141" },
  ]);
  assert.equal(
    resolveSelectedBudgetAssetId(options, "stale-id", "near"),
    "near",
  );
  assert.equal(
    resolveSelectedBudgetAssetId(options, "usdc", "near"),
    "usdc",
  );
});

test("validateBudgetAssetForCreate rejects disabled and wrong-network assets", () => {
  assert.equal(
    validateBudgetAssetForCreate(undefined, "near:testnet"),
    "Select a supported asset",
  );
  assert.match(
    validateBudgetAssetForCreate(
      {
        chain_id: "near:testnet",
        enabled: false,
        symbol: "USDC",
      },
      "near:testnet",
    ) ?? "",
    /not available/i,
  );
  assert.match(
    validateBudgetAssetForCreate(
      {
        chain_id: "near:mainnet",
        enabled: true,
        symbol: "USDC",
      },
      "near:testnet",
    ) ?? "",
    /network/i,
  );
  assert.equal(
    validateBudgetAssetForCreate(
      {
        chain_id: "near:testnet",
        enabled: true,
        symbol: "USDC",
      },
      "near:testnet",
    ),
    null,
  );
});
