import assert from "node:assert/strict";
import test from "node:test";

import { readPublicNearNetworkId, resolveWalletNetwork } from "./network-config";
import { buildNearConnectorOptions } from "./near-connect-config";

test("defaults to localnet when unset", () => {
  assert.equal(readPublicNearNetworkId({}), "localnet");
});

test("explicit testnet is opt-in", () => {
  assert.equal(
    readPublicNearNetworkId({ NEXT_PUBLIC_NEAR_NETWORK_ID: "testnet" }),
    "testnet",
  );
});

test("buildNearConnectorOptions supports mainnet", () => {
  const opts = buildNearConnectorOptions({
    NEXT_PUBLIC_NEAR_NETWORK_ID: "mainnet",
    NEXT_PUBLIC_NEAR_RPC_URL: "https://rpc.mainnet.fastnear.com",
  });
  assert.equal(opts.network, "mainnet");
  assert.equal(opts.appNetworkId, "mainnet");
});

test("resolveWalletNetwork keeps testnet id for testnet config", () => {
  const net = resolveWalletNetwork({
    NEXT_PUBLIC_NEAR_NETWORK_ID: "testnet",
    NEXT_PUBLIC_NEAR_RPC_URL: "https://rpc.testnet.fastnear.com",
  });
  assert.equal(net.networkId, "testnet");
});
