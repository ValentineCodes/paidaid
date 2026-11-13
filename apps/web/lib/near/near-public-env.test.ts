import assert from "node:assert/strict";
import test from "node:test";

import { readNearPublicEnv } from "./near-public-env";

test("readNearPublicEnv prefers NEXT_PUBLIC and falls back to server NEAR_NETWORK_ID", () => {
  const env = readNearPublicEnv({
    NEAR_NETWORK_ID: "testnet",
    NEAR_RPC_URL: "https://rpc.testnet.fastnear.com",
    NEAR_ESCROW_CONTRACT_ID: "escrow.parent.testnet",
  });
  assert.equal(env.networkId, "testnet");
  assert.equal(env.escrowContractId, "escrow.parent.testnet");
});

test("readNearPublicEnv defaults to localnet in non-production when unset", () => {
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";
  try {
    const env = readNearPublicEnv({
      NEXT_PUBLIC_NEAR_CONTRACT_ID: "paidaid.sandbox",
    });
    assert.equal(env.networkId, "localnet");
  } finally {
    process.env.NODE_ENV = prev;
  }
});
