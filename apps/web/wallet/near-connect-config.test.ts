import assert from "node:assert/strict";
import test from "node:test";

import {
  assertConnectorNetworkMatchesApp,
  buildNearConnectorOptions,
  paidAidNetworkToConnectorNetwork,
} from "./near-connect-config";

test("paidAidNetworkToConnectorNetwork maps localnet to testnet slot", () => {
  assert.equal(paidAidNetworkToConnectorNetwork("localnet"), "testnet");
  assert.equal(paidAidNetworkToConnectorNetwork("testnet"), "testnet");
  assert.equal(paidAidNetworkToConnectorNetwork("mainnet"), "mainnet");
});

test("buildNearConnectorOptions wires RPC providers per network", () => {
  const mainnet = buildNearConnectorOptions({
    NEXT_PUBLIC_NEAR_NETWORK_ID: "mainnet",
    NEXT_PUBLIC_NEAR_RPC_URL: "https://rpc.mainnet.fastnear.com",
  });
  assert.equal(mainnet.network, "mainnet");
  assert.deepEqual(mainnet.providers?.mainnet, ["https://rpc.mainnet.fastnear.com"]);
  assert.equal(mainnet.features?.signMessage, true);

  const local = buildNearConnectorOptions({
    NEXT_PUBLIC_NEAR_NETWORK_ID: "localnet",
    NEXT_PUBLIC_NEAR_RPC_URL: "http://127.0.0.1:3030",
  });
  assert.equal(local.appNetworkId, "localnet");
  assert.equal(local.network, "testnet");
  assert.deepEqual(local.providers?.testnet, ["http://127.0.0.1:3030"]);
});

test("assertConnectorNetworkMatchesApp rejects mismatched mapping", () => {
  assert.throws(
    () => assertConnectorNetworkMatchesApp("mainnet", "testnet"),
    /network mismatch/i,
  );
});
