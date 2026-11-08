import assert from "node:assert/strict";
import test from "node:test";

import { buildEscrowFundCallArgs } from "./escrow-fund-call";
import type { EngagementFundingPrepareResult } from "../engagement/funding-types";

test("buildEscrowFundCallArgs normalizes provider account", () => {
  const terms: EngagementFundingPrepareResult = {
    paymentId: "p",
    engagementId: "eng-uuid",
    chainId: "near:localnet",
    escrowContractId: "paidaid-escrow.sandbox",
    assetStandard: "native",
    tokenContractId: null,
    amountSmallestUnits: "42",
    symbol: "NEAR",
    decimals: 24,
    requesterNearAccountId: "a.sandbox",
    providerNearAccountId: "Provider.Sandbox",
    onChainEscrowId: null,
    status: "prepared",
    createTxHash: null,
    fundTxHash: null,
  };
  const args = buildEscrowFundCallArgs(terms);
  assert.equal(args.engagement_id, "eng-uuid");
  assert.equal(args.provider, "provider.sandbox");
  assert.equal(args.amount, "42");
});
