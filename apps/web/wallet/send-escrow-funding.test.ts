import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ESCROW_METHODS, ESCROW_FUND_FT_MSG_VERSION } from "@paidaid/shared";
import {
  buildEscrowFundCallArgs,
  buildEscrowFundMilestonesCallArgs,
  buildNep141FundEscrowTransferMessage,
} from "../lib/near/escrow-fund-call";
import type { EngagementFundingPrepareResult } from "../lib/engagement/funding-types";

const terms: EngagementFundingPrepareResult = {
  paymentId: "pay-1",
  engagementId: "550e8400-e29b-41d4-a716-446655440000",
  chainId: "near:localnet",
  escrowContractId: "paidaid-escrow.sandbox",
  assetStandard: "native",
  tokenContractId: null,
  amountSmallestUnits: "1000000000000000000000000",
  symbol: "NEAR",
  decimals: 24,
  requesterNearAccountId: "alice.sandbox",
  providerNearAccountId: "Bob.Sandbox",
  onChainEscrowId: null,
  status: "prepared",
  createTxHash: null,
  fundTxHash: null,
  paymentMode: "single",
  milestoneAmountsSmallest: null,
};

describe("send-escrow-funding helpers", () => {
  it("uses fund_escrow for native path constant", () => {
    assert.equal(ESCROW_METHODS.fundEscrow, "fund_escrow");
  });

  it("builds milestone native fund args", () => {
    const milestoneTerms = {
      ...terms,
      paymentMode: "milestones" as const,
      milestoneAmountsSmallest: ["500000", "500000"],
    };
    const args = buildEscrowFundMilestonesCallArgs(milestoneTerms);
    assert.deepEqual(args.milestones, ["500000", "500000"]);
    assert.equal(ESCROW_METHODS.fundEscrowMilestones, "fund_escrow_milestones");
  });

  it("builds NEP-141 ft_transfer_call message v2", () => {
    const args = buildEscrowFundCallArgs(terms);
    assert.equal(args.engagement_id, terms.engagementId);
    assert.equal(args.provider, "bob.sandbox");

    const msg = buildNep141FundEscrowTransferMessage(terms);
    const parsed = JSON.parse(msg) as {
      version: string;
      engagement_id: string;
      provider: string;
    };
    assert.equal(parsed.version, ESCROW_FUND_FT_MSG_VERSION);
    assert.equal(parsed.engagement_id, terms.engagementId);
    assert.equal(parsed.provider, "bob.sandbox");
  });

  it("builds NEP-141 message with milestones", () => {
    const milestoneTerms = {
      ...terms,
      assetStandard: "nep141" as const,
      tokenContractId: "usdc.sandbox",
      milestoneAmountsSmallest: ["1000000", "2000000"],
    };
    const msg = buildNep141FundEscrowTransferMessage(milestoneTerms);
    const parsed = JSON.parse(msg) as { milestones?: string[] };
    assert.deepEqual(parsed.milestones, ["1000000", "2000000"]);
  });
});
