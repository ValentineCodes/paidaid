import assert from "node:assert/strict";
import test from "node:test";

import {
  formatSmallestUnits,
  normalizeDbNumericAmount,
  parseSmallestUnitsString,
  smallestUnitsStringToBigInt,
} from "./amounts.ts";

test("formatSmallestUnits formats whole NEAR", () => {
  const yocto = "1000000000000000000000000";
  assert.equal(formatSmallestUnits(yocto, 24), "1");
});

test("formatSmallestUnits keeps indivisible remainder as fractional string", () => {
  assert.equal(formatSmallestUnits("1500000", 6), "1.5");
});

test("parseSmallestUnitsString rejects decimals", () => {
  assert.equal(parseSmallestUnitsString("1.5"), null);
});

test("normalizeDbNumericAmount handles scientific string", () => {
  assert.equal(
    normalizeDbNumericAmount("5e+24"),
    "5000000000000000000000000",
  );
});

test("normalizeDbNumericAmount handles JS number from JSON", () => {
  assert.equal(
    smallestUnitsStringToBigInt(String(5e24)),
    5_000_000_000_000_000_000_000_000n,
  );
});
