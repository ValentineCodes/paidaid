import assert from "node:assert/strict";
import test from "node:test";

import { KeyPair } from "@near-js/crypto";
import { buildEscrowFundingAuthMessage } from "@paidaid/shared";

import { signEscrowFundingAuthorization } from "./escrow-funding-authorization";

test("signEscrowFundingAuthorization produces method args for contract", () => {
  const keyPair = KeyPair.fromRandom("ED25519");
  process.env.NEAR_ESCROW_FUNDING_SIGNER_PRIVATE_KEY = keyPair.toString();

  const auth = signEscrowFundingAuthorization({
    contractId: "paidaid-escrow.sandbox",
    networkId: "localnet",
    engagementId: "550e8400-e29b-41d4-a716-446655440000",
    requester: "alice.sandbox",
    provider: "bob.sandbox",
    asset: "native",
    ftContractId: null,
    amountSmallestUnits: "10",
    nonce: "0123456789abcdef0123456789abcdef",
    expiresAtNs: 9_999_999_999_999_999n,
  });

  assert.equal(auth.methodArgs.signature.length > 0, true);
  assert.equal(
    buildEscrowFundingAuthMessage(auth.payload),
    buildEscrowFundingAuthMessage({
      ...auth.payload,
      requester: auth.payload.requester.toLowerCase(),
      provider: auth.payload.provider.toLowerCase(),
    }),
  );
  delete process.env.NEAR_ESCROW_FUNDING_SIGNER_PRIVATE_KEY;
});
