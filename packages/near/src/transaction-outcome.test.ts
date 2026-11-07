import assert from "node:assert/strict";
import test from "node:test";
import {
  assertTransactionFinalSuccess,
  extractTransactionHash,
  normalizeTransactionOutcome,
  TransactionExecutionFailedError,
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

test("assertTransactionFinalSuccess rejects Failure status", () => {
  assert.throws(
    () =>
      assertTransactionFinalSuccess({
        status: { Failure: { error_message: "boom" } },
      }),
    TransactionExecutionFailedError,
  );
});

test("assertTransactionFinalSuccess accepts SuccessValue", () => {
  assert.doesNotThrow(() =>
    assertTransactionFinalSuccess({
      status: { SuccessValue: "" },
      transaction_outcome: { outcome: { status: { SuccessReceiptId: "x" } } },
    }),
  );
});
