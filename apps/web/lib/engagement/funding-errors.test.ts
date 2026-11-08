import assert from "node:assert/strict";
import test from "node:test";
import { formatEngagementFundingError } from "./funding-errors";

test("formatEngagementFundingError maps provider wallet message", () => {
  const out = formatEngagementFundingError(
    "provider has no linked NEAR wallet",
  );
  assert.match(out, /provider must sign in/i);
});
