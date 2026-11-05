import assert from "node:assert/strict";
import test from "node:test";
import { createProvider, readNearConfig, viewMethod } from "./index.ts";
import { readNearPublicConfig } from "./config.ts";

const localnetEnv = {
  NEAR_NETWORK_ID: "localnet",
  NEAR_RPC_URL: "http://127.0.0.1:3030",
};

test("readNearConfig reads localnet settings", () => {
  const config = readNearConfig({
    ...localnetEnv,
    NEAR_CONTRACT_ID: "paidaid.sandbox",
  });

  assert.deepEqual(config, {
    networkId: "localnet",
    rpcUrl: "http://127.0.0.1:3030",
    contractId: "paidaid.sandbox",
  });
});

test("readNearConfig omits an unset contract account", () => {
  const config = readNearConfig(localnetEnv);
  assert.equal(config.contractId, undefined);
});

test("readNearConfig defaults RPC for localnet", () => {
  const config = readNearConfig({ NEAR_NETWORK_ID: "localnet" });
  assert.equal(config.rpcUrl, "http://127.0.0.1:3030");
});

test("readNearConfig rejects testnet", () => {
  assert.throws(
    () =>
      readNearConfig({
        NEAR_NETWORK_ID: "testnet",
        NEAR_RPC_URL: "https://rpc.testnet.near.org",
      }),
    /Unsupported NEAR network/,
  );
});

test("readNearConfig rejects mainnet", () => {
  assert.throws(
    () =>
      readNearConfig({
        NEAR_NETWORK_ID: "mainnet",
        NEAR_RPC_URL: "https://rpc.mainnet.near.org",
      }),
    /Unsupported NEAR network/,
  );
});

test("readNearConfig rejects an empty contract account", () => {
  assert.throws(
    () =>
      readNearConfig({
        ...localnetEnv,
        NEAR_CONTRACT_ID: "",
      }),
    /cannot be empty/,
  );
});

test("createProvider uses the configured RPC URL", () => {
  const provider = createProvider(readNearConfig(localnetEnv));
  assert.equal(typeof provider.callFunction, "function");
});

test("readNearPublicConfig reads browser env keys", () => {
  const config = readNearPublicConfig({
    NEXT_PUBLIC_NEAR_NETWORK_ID: "localnet",
    NEXT_PUBLIC_NEAR_RPC_URL: "http://127.0.0.1:3030",
    NEXT_PUBLIC_NEAR_CONTRACT_ID: "paidaid.sandbox",
  });

  assert.equal(config.contractId, "paidaid.sandbox");
});

test("viewMethod requires a contract account", async () => {
  await assert.rejects(
    () => viewMethod(readNearConfig(localnetEnv), "get_total_messages", {}),
    /NEAR_CONTRACT_ID is required/,
  );
});
