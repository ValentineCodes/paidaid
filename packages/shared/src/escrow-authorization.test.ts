import assert from "node:assert/strict";
import test from "node:test";

import { buildEscrowFundingAuthMessage } from "./escrow-authorization";

test("buildEscrowFundingAuthMessage matches contract canonical format", () => {
  const msg = buildEscrowFundingAuthMessage({
    contractId: "paidaid-escrow.sandbox",
    networkId: "localnet",
    engagementId: "550e8400-e29b-41d4-a716-446655440000",
    requester: "alice.sandbox",
    provider: "bob.sandbox",
    asset: "native",
    ftContractId: null,
    amountSmallestUnits: "1000000000000000000000000",
    expiresAtNs: "9999999999999999999",
    nonce: "0123456789abcdef0123456789abcdef",
  });
  assert.match(msg, /^PAIDAID_ESCROW_FUND_AUTH_v1/);
  assert.match(msg, /contract_id=paidaid-escrow\.sandbox/);
  assert.match(msg, /network_id=localnet/);
  assert.match(msg, /asset=Native/);
  assert.match(msg, /ft_contract=$/m);
});
