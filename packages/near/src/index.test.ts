import assert from "node:assert/strict";
import test from "node:test";
import { createProvider, readNearConfig, viewMethod } from "./index.ts";

const testnetEnv = {
  NEAR_NETWORK_ID: "testnet",
  NEAR_RPC_URL: "https://rpc.testnet.near.org",
};

test("readNearConfig reads testnet settings", () => {
  const config = readNearConfig({
    ...testnetEnv,
    NEAR_CONTRACT_ID: "core.paidaid.testnet",
  });

  assert.deepEqual(config, {
    networkId: "testnet",
    rpcUrl: "https://rpc.testnet.near.org",
    contractId: "core.paidaid.testnet",
  });
});

test("readNearConfig omits an unset contract account", () => {
  const config = readNearConfig(testnetEnv);
  assert.equal(config.contractId, undefined);
});

test("readNearConfig rejects a non-testnet network", () => {
  assert.throws(
    () =>
      readNearConfig({
        NEAR_NETWORK_ID: "mainnet",
        NEAR_RPC_URL: "https://rpc.testnet.near.org",
      }),
    /testnet/,
  );
});

test("readNearConfig rejects an empty contract account", () => {
  assert.throws(
    () =>
      readNearConfig({
        ...testnetEnv,
        NEAR_CONTRACT_ID: "",
      }),
    /cannot be empty/,
  );
});

test("createProvider uses the configured RPC URL", () => {
  const provider = createProvider(readNearConfig(testnetEnv));
  assert.equal(typeof provider.callFunction, "function");
});

test("viewMethod requires a contract account", async () => {
  await assert.rejects(
    () => viewMethod(readNearConfig(testnetEnv), "get_total_messages", {}),
    /NEAR_CONTRACT_ID is required/,
  );
});
