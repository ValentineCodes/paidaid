import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSetMessageCall,
  extractTransactionHash,
} from "./core-contract.ts";
import { validateAccountId, validateMessage } from "./validation.ts";

const config = {
  networkId: "localnet" as const,
  rpcUrl: "http://127.0.0.1:3030",
  contractId: "paidaid.sandbox",
};

test("validateMessage rejects empty input", () => {
  assert.equal(validateMessage("   "), "Message cannot be empty.");
});

test("validateAccountId rejects invalid names", () => {
  assert.equal(validateAccountId(""), "Account ID is required.");
  assert.equal(validateAccountId("BAD NAME"), "Account ID format is invalid.");
});

test("buildSetMessageCall matches PaidAidCore interface", () => {
  const call = buildSetMessageCall(config, "hello");
  assert.deepEqual(call, {
    contractId: "paidaid.sandbox",
    method: "set_message",
    args: { message: "hello" },
  });
});

test("extractTransactionHash reads NEAR execution outcomes", () => {
  assert.equal(
    extractTransactionHash({
      transaction_outcome: { id: "abc123" },
    }),
    "abc123",
  );
  assert.equal(extractTransactionHash(null), null);
});
