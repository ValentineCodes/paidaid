import assert from "node:assert/strict";
import test from "node:test";

import { escrowNearConfigForPayment } from "./escrow-config";

test("escrowNearConfigForPayment uses payment row contract and chain", () => {
  const config = escrowNearConfigForPayment(
    {
      escrow_contract_id: "escrow.test.sandbox",
      chain_id: "near:localnet",
    },
    {
      NEAR_NETWORK_ID: "localnet",
      NEXT_PUBLIC_NEAR_NETWORK_ID: "localnet",
      NEAR_RPC_URL: "http://127.0.0.1:3030",
      NEXT_PUBLIC_NEAR_RPC_URL: "http://127.0.0.1:3030",
    },
  );
  assert.equal(config.escrowContractId, "escrow.test.sandbox");
  assert.equal(config.networkId, "localnet");
  assert.equal(config.rpcUrl, "http://127.0.0.1:3030");
});

test("escrowNearConfigForPayment rejects env/network mismatch", () => {
  assert.throws(() =>
    escrowNearConfigForPayment(
      {
        escrow_contract_id: "escrow.test.sandbox",
        chain_id: "near:testnet",
      },
      {
        NEAR_NETWORK_ID: "localnet",
        NEXT_PUBLIC_NEAR_NETWORK_ID: "localnet",
      },
    ),
  );
});
