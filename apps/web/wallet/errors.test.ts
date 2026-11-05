import assert from "node:assert/strict";
import test from "node:test";
import { formatWalletConnectionError } from "./errors.ts";
import { readWalletContractId } from "./config.ts";

test("formatWalletConnectionError maps cancellation", () => {
  assert.equal(
    formatWalletConnectionError(new Error("User rejected the request")),
    "Connection cancelled.",
  );
});

test("readWalletContractId rejects empty contract id", () => {
  assert.throws(
    () => readWalletContractId({ NEXT_PUBLIC_NEAR_CONTRACT_ID: "" }),
    /cannot be empty/,
  );
});
