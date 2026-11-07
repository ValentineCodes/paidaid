import assert from "node:assert/strict";
import test from "node:test";

import type { NearConfig } from "@paidaid/shared";

import { readNativeNearBalance, readNep141Balance } from "./balances.ts";

const config: NearConfig = {
  networkId: "localnet",
  rpcUrl: "http://127.0.0.1:3030",
};

test("readNativeNearBalance rejects invalid account id", async () => {
  const result = await readNativeNearBalance(config, "");
  assert.equal(result.status, "invalid_account");
});

test("readNep141Balance rejects invalid contract", async () => {
  const result = await readNep141Balance(config, "", "alice.sandbox");
  assert.equal(result.status, "invalid_asset");
});

test(
  "integration: readNativeNearBalance hits sandbox when available",
  { skip: process.env.PAIDAID_RPC_INTEGRATION !== "1" },
  async () => {
    const result = await readNativeNearBalance(config, "paidaid.sandbox");
    assert.equal(result.status, "ok");
    assert.match(result.smallestUnits ?? "", /^\d+$/);
  },
);
