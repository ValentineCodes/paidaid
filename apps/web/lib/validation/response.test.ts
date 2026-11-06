import test from "node:test";
import assert from "node:assert/strict";

import { validateResponseOfferInput } from "./response";

test("validateResponseOfferInput accepts whole human offer matching asset decimals", () => {
  const { fieldErrors } = validateResponseOfferInput(
    { message: "", headline: "", proposedHuman: "10" },
    { symbol: "NEAR", decimals: 24 },
  );
  assert.equal(fieldErrors, null);
});

test("validateResponseOfferInput rejects fractional human amount", () => {
  const { fieldErrors } = validateResponseOfferInput(
    { message: "", headline: "", proposedHuman: "10.5" },
    { symbol: "NEAR", decimals: 24 },
  );
  assert.ok(fieldErrors?.proposedHuman);
});

test("validateResponseOfferInput rejects message over limit", () => {
  const { fieldErrors } = validateResponseOfferInput(
    { message: "x".repeat(2001), headline: "", proposedHuman: "1" },
    { symbol: "NEAR", decimals: 24 },
  );
  assert.ok(fieldErrors?.message);
});
