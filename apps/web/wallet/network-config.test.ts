import assert from "node:assert/strict";
import test from "node:test";

import {
  readPublicNearNetworkId,
  resolveWalletNetwork,
  walletModules,
} from "./network-config";

test("defaults to localnet when unset", () => {
  assert.equal(readPublicNearNetworkId({}), "localnet");
});

test("explicit testnet is opt-in", () => {
  assert.equal(
    readPublicNearNetworkId({ NEXT_PUBLIC_NEAR_NETWORK_ID: "testnet" }),
    "testnet",
  );
});

test("walletModules uses localnet stack by default", () => {
  const modules = walletModules({});
  assert.equal(modules.length, 1);
});

test("walletModules rejects mainnet", () => {
  assert.throws(() =>
    walletModules({ NEXT_PUBLIC_NEAR_NETWORK_ID: "mainnet" }),
  );
});

test("resolveWalletNetwork keeps testnet id for testnet config", () => {
  const net = resolveWalletNetwork({
    NEXT_PUBLIC_NEAR_NETWORK_ID: "testnet",
    NEXT_PUBLIC_NEAR_RPC_URL: "https://rpc.testnet.near.org",
  });
  assert.equal(net.networkId, "testnet");
});
