import assert from "node:assert/strict";
import test from "node:test";
import {
  extractTransactionHash,
  normalizeTransactionOutcome,
} from "./transaction-outcome";

test("extractTransactionHash prefers transaction.hash after normalize", () => {
  const hash = extractTransactionHash(
    normalizeTransactionOutcome([
      ["transaction", [["hash", "CorrectHash123"]]],
      ["transaction_outcome", [["id", "ReceiptIdOnly"]]],
    ]),
  );
  assert.equal(hash, "CorrectHash123");
});
