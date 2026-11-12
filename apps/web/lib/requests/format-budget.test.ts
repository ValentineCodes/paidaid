import test from "node:test";
import assert from "node:assert/strict";

import { formatBudgetSmallestUnits } from "./format-budget";

test("formatBudgetSmallestUnits converts yocto NEAR string to whole NEAR", () => {
  const yoctoTenNear = "10000000000000000000000000";
  assert.equal(formatBudgetSmallestUnits(yoctoTenNear, 24), "10");
});

test("formatBudgetSmallestUnits parses scientific notation from JSON float round-trip", () => {
  assert.equal(formatBudgetSmallestUnits("1e+25", 24), "10");
  assert.equal(formatBudgetSmallestUnits(1e25, 24), "10");
});

test("formatBudgetSmallestUnits shows fractional NEAR", () => {
  assert.equal(
    formatBudgetSmallestUnits("1000000000000000000000", 24),
    "0.001",
  );
  assert.equal(
    formatBudgetSmallestUnits("2500000000000000000000000", 24),
    "2.5",
  );
});
