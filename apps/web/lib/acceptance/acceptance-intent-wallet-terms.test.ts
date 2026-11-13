import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { acceptanceIntentToWalletTerms } from "./acceptance-intent-wallet-terms";
import type { AcceptanceFundingPrepareResult } from "./acceptance-funding-types";

const base: AcceptanceFundingPrepareResult = {
  intentId: "i1",
  paymentId: "p1",
  requestId: "r1",
  responseId: "s1",
  plannedEngagementId: "e1",
  chainId: "near:localnet",
  escrowContractId: "escrow.localnet",
  assetStandard: "native",
  tokenContractId: null,
  amountSmallestUnits: "1000000000000000000000000",
  symbol: "NEAR",
  decimals: 24,
  requesterNearAccountId: "alice.localnet",
  providerNearAccountId: "bob.localnet",
  status: "awaiting_wallet",
  createTxHash: null,
  fundTxHash: null,
  onChainEscrowId: null,
  paymentMode: "single",
  milestoneAmountsSmallest: null,
};

describe("acceptanceIntentToWalletTerms", () => {
  it("maps planned engagement id to wallet engagementId", () => {
    const terms = acceptanceIntentToWalletTerms(base);
    assert.equal(terms.engagementId, "e1");
    assert.equal(terms.status, "prepared");
  });

  it("maps finalized intent to funded payment status", () => {
    const terms = acceptanceIntentToWalletTerms({
      ...base,
      status: "finalized",
    });
    assert.equal(terms.status, "funded");
  });
});
