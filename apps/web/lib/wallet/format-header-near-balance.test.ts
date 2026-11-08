import assert from "node:assert/strict";
import test from "node:test";

import { formatHeaderNearBalanceFromYocto } from "./format-header-near-balance";

test("formatHeaderNearBalanceFromYocto formats 1 NEAR", () => {
  const yocto = "1000000000000000000000000";
  const view = formatHeaderNearBalanceFromYocto(yocto);
  assert.equal(view.status, "ok");
  if (view.status === "ok") {
    assert.equal(view.display, "1\u00a0NEAR");
  }
});

test("formatHeaderNearBalanceFromYocto handles empty", () => {
  const view = formatHeaderNearBalanceFromYocto(null);
  assert.equal(view.status, "unavailable");
});

test("formatHeaderNearBalanceFromYocto truncates to 4 decimal places", () => {
  const yocto = "1234567890123456789012345";
  const view = formatHeaderNearBalanceFromYocto(yocto);
  assert.equal(view.status, "ok");
  if (view.status === "ok") {
    assert.equal(view.display, "1.2345\u00a0NEAR");
  }
});
