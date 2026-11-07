import assert from "node:assert/strict";
import test from "node:test";

import { formatAcceptanceFundingError } from "./acceptance-funding-errors";

test("formatAcceptanceFundingError maps wallet rejection", () => {
  const out = formatAcceptanceFundingError("User rejected the transaction");
  assert.match(out, /still pending/i);
});

test("formatAcceptanceFundingError maps concurrent acceptance", () => {
  const out = formatAcceptanceFundingError("another acceptance is in progress");
  assert.match(out, /already in progress/i);
});

test("formatAcceptanceFundingError maps RPC downtime", () => {
  const out = formatAcceptanceFundingError("fetch failed: timeout");
  assert.match(out, /temporarily unavailable/i);
});
