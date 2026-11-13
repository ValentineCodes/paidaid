import assert from "node:assert/strict";
import test from "node:test";

import { readAlignedNearRuntimeConfig } from "./runtime-config";

test("readAlignedNearRuntimeConfig rejects network mismatch", () => {
  assert.throws(
    () =>
      readAlignedNearRuntimeConfig({
        NEXT_PUBLIC_NEAR_NETWORK_ID: "localnet",
        NEAR_NETWORK_ID: "testnet",
      }),
    /network mismatch/i,
  );
});

test("readAlignedNearRuntimeConfig aligns public and server", () => {
  const config = readAlignedNearRuntimeConfig({
    NEXT_PUBLIC_NEAR_NETWORK_ID: "testnet",
    NEAR_NETWORK_ID: "testnet",
  });
  assert.equal(config.networkId, "testnet");
  assert.equal(config.rpcUrl, "https://rpc.testnet.fastnear.com");
});
