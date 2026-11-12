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

test("formatAcceptanceFundingError surfaces payment network mismatch", () => {
  const out = formatAcceptanceFundingError(
    "Payment escrow verification: network mismatch (expected testnet, got localnet).",
  );
  assert.match(out, /different NEAR network/i);
  assert.doesNotMatch(out, /temporarily unavailable/i);
});

test("formatAcceptanceFundingError surfaces env network mismatch", () => {
  const out = formatAcceptanceFundingError(
    "NEAR_NETWORK_ID vs NEXT_PUBLIC_NEAR_NETWORK_ID: network mismatch (expected testnet, got localnet).",
  );
  assert.match(out, /env vars disagree/i);
});
