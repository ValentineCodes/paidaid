import assert from "node:assert/strict";
import test from "node:test";

import {
  escrowNearConfigForPayment,
  readEscrowContractId,
  readEscrowContractIdForNewFunding,
  readEscrowMilestonesContractId,
} from "./escrow-config";

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

test("readEscrowContractId and milestones default separately on localnet", () => {
  const env = {
    NEAR_NETWORK_ID: "localnet",
    NEXT_PUBLIC_NEAR_NETWORK_ID: "localnet",
  };
  assert.equal(readEscrowContractId(env), "paidaid-escrow.sandbox");
  assert.equal(readEscrowMilestonesContractId(env), "paidaid-escrow-milestones.sandbox");
  assert.equal(readEscrowContractIdForNewFunding("single", env), "paidaid-escrow.sandbox");
  assert.equal(
    readEscrowContractIdForNewFunding("milestones", env),
    "paidaid-escrow-milestones.sandbox",
  );
});

test("readEscrowContractIdForNewFunding honors explicit env overrides", () => {
  const env = {
    NEAR_NETWORK_ID: "testnet",
    NEAR_ESCROW_CONTRACT_ID: "legacy.parent.testnet",
    NEAR_ESCROW_MILESTONES_CONTRACT_ID: "milestones.parent.testnet",
  };
  assert.equal(readEscrowContractIdForNewFunding("single", env), "legacy.parent.testnet");
  assert.equal(
    readEscrowContractIdForNewFunding("milestones", env),
    "milestones.parent.testnet",
  );
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
