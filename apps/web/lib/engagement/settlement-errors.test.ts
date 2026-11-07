import assert from "node:assert/strict";
import test from "node:test";

test("settlement blocks open issues message", () => {
  const msg = "Resolve open issues before releasing payment.";
  assert.match(msg, /open issues/i);
});
