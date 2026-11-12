import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyNearTransactionError,
  formatNearTransactionError,
  isUserRejectedTransaction,
} from "./near-transaction-errors";

test("classifyNearTransactionError detects cancellation", () => {
  assert.equal(
    classifyNearTransactionError(new Error("User rejected the request")),
    "user_rejected",
  );
  assert.equal(isUserRejectedTransaction(new Error("closed popup")), true);
});

test("formatNearTransactionError maps network mismatch", () => {
  const formatted = formatNearTransactionError(
    new Error("Escrow funding: network mismatch (expected localnet, got testnet)."),
  );
  assert.match(formatted, /network mismatch/i);
});
