import assert from "node:assert/strict";
import test from "node:test";
import { CORE_METHODS, PROTOCOL_NAME } from "./index.ts";

test("protocol name is PaidAid", () => {
  assert.equal(PROTOCOL_NAME, "PaidAid");
});

test("core method names match the contract", () => {
  assert.equal(CORE_METHODS.setMessage, "set_message");
  assert.equal(CORE_METHODS.getMessage, "get_message");
  assert.equal(CORE_METHODS.getTotalMessages, "get_total_messages");
});
