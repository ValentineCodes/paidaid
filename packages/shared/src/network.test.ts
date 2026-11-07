import assert from "node:assert/strict";
import test from "node:test";

import {
  chainIdFromNetwork,
  networkFromChainId,
  parseNearNetworkId,
} from "./network.ts";

test("parseNearNetworkId accepts all supported networks", () => {
  assert.equal(parseNearNetworkId(undefined), "localnet");
  assert.equal(parseNearNetworkId("testnet"), "testnet");
  assert.equal(parseNearNetworkId("mainnet"), "mainnet");
});

test("parseNearNetworkId rejects unknown networks", () => {
  assert.throws(() => parseNearNetworkId("betanet"), /Unsupported NEAR network/);
});

test("chainIdFromNetwork round-trips with networkFromChainId", () => {
  for (const n of ["localnet", "testnet", "mainnet"] as const) {
    assert.equal(networkFromChainId(chainIdFromNetwork(n)), n);
  }
});
