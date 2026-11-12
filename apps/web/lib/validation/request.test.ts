import assert from "node:assert";
import { test } from "node:test";

import { validateCreateRequestFormForTests } from "../requests/validate-create-input";
import {
  humanAmountToSmallestUnits,
  validateBudgetSmallestUnitsAgainstAsset,
  validateRequestComposer,
} from "./request";
import type { Tables } from "../database.types";

const sampleAssets: Tables<"assets">[] = [
  {
    id: "a1",
    chain_id: "near:testnet",
    asset_standard: "native",
    native_reference: "near",
    token_contract_id: null,
    symbol: "NEAR",
    decimals: 24,
    canonical_asset_key: "near:testnet:native:near",
    created_at: "",
  },
  {
    id: "a2",
    chain_id: "near:testnet",
    asset_standard: "nep141",
    native_reference: null,
    token_contract_id: "ft.example",
    symbol: "USDC",
    decimals: 6,
    canonical_asset_key: "near:testnet:nep141:ft.example",
    created_at: "",
  },
];

const baseValues = {
  title: "Fix my sink",
  description: "Kitchen tap is leaking.",
  timingType: "immediate" as const,
  scheduledAt: "",
  deadlineAt: "",
  expiresAt: "",
  locationKind: "unspecified" as const,
  locationLabel: "",
  budgetHuman: "2",
  budgetAssetId: "a1",
  tagIds: [] as string[],
};

test("humanAmountToSmallestUnits avoids floats", () => {
  const r = humanAmountToSmallestUnits("2", 24);
  assert(r.ok);
  assert.strictEqual(r.smallestUnits, "2000000000000000000000000");
});

test("humanAmountToSmallestUnits accepts fractional NEAR", () => {
  const r = humanAmountToSmallestUnits("0.001", 24);
  assert(r.ok);
  assert.strictEqual(r.smallestUnits, "1000000000000000000000");
});

test("validateBudgetSmallestUnitsAgainstAsset accepts fractional smallest units", () => {
  const subUnit = validateBudgetSmallestUnitsAgainstAsset(
    "1000000000000000000000",
    sampleAssets[0],
  );
  assert.strictEqual(subUnit.ok, true);
  const whole = validateBudgetSmallestUnitsAgainstAsset(
    "2000000000000000000000000",
    sampleAssets[0],
  );
  assert.strictEqual(whole.ok, true);
});

test("tag max three", () => {
  const { fieldErrors } = validateRequestComposer(
    {
      ...baseValues,
      tagIds: ["1", "2", "3", "4"],
    },
    sampleAssets,
  );
  assert(fieldErrors?.tags);
});

test("scheduled requires scheduled_at", () => {
  const { fieldErrors } = validateRequestComposer(
    {
      ...baseValues,
      timingType: "scheduled",
      scheduledAt: "",
    },
    sampleAssets,
  );
  assert(fieldErrors?.scheduledAt);
});

test("title length", () => {
  const { fieldErrors } = validateRequestComposer(
    { ...baseValues, title: "ab" },
    sampleAssets,
  );
  assert(fieldErrors?.title);
});

test("description optional but has max length", () => {
  const { fieldErrors } = validateRequestComposer(
    { ...baseValues, description: "" },
    sampleAssets,
  );
  assert.equal(fieldErrors, null);
  const long = "x".repeat(1001);
  const { fieldErrors: e2 } = validateRequestComposer(
    { ...baseValues, description: long },
    sampleAssets,
  );
  assert(e2?.description);
});

test("photo count and mime", () => {
  const many = Array.from({ length: 2 }, () => ({
    size: 100,
    type: "image/jpeg",
  }));
  const { fieldErrors } = validateRequestComposer(baseValues, sampleAssets, {
    photoFiles: many,
  });
  assert(fieldErrors?.photos);

  const badMime = [{ size: 100, type: "application/x-msdownload" }];
  const { fieldErrors: e2 } = validateRequestComposer(
    baseValues,
    sampleAssets,
    {
      photoFiles: badMime,
    },
  );
  assert(e2?.photos);
});

test("validateCreateRequestFormForTests positive path", () => {
  const r = validateCreateRequestFormForTests({
    values: baseValues,
    assets: sampleAssets,
    photoFiles: [],
  });
  assert.strictEqual(r.error, null);
  assert(!r.fieldErrors);
});

test("USDC six decimals whole units", () => {
  const v = {
    ...baseValues,
    budgetAssetId: "a2",
    budgetHuman: "10",
  };
  const r = validateCreateRequestFormForTests({
    values: v,
    assets: sampleAssets,
    photoFiles: [],
  });
  assert(!r.fieldErrors);

  const sub = humanAmountToSmallestUnits("1", 6);
  assert(sub.ok);
  const prec = validateBudgetSmallestUnitsAgainstAsset(
    sub.smallestUnits,
    sampleAssets[1],
  );
  assert.strictEqual(prec.ok, true);
  const half = humanAmountToSmallestUnits("0.5", 6);
  assert(half.ok);
  const halfValid = validateBudgetSmallestUnitsAgainstAsset(
    half.smallestUnits,
    sampleAssets[1],
  );
  assert.strictEqual(halfValid.ok, true);
});
