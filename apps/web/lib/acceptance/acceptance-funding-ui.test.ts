import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  blocksDuplicateFundingAttempt,
  canContinueAcceptanceFunding,
  canRetryAcceptanceFunding,
  deriveAcceptanceFundingUiPhase,
  shouldShowContinueFunding,
} from "./acceptance-funding-ui";
import type { AcceptanceFundingPrepareResult } from "./acceptance-funding-types";

const baseIntent: AcceptanceFundingPrepareResult = {
  intentId: "i1",
  paymentId: "p1",
  requestId: "r1",
  responseId: "s1",
  plannedEngagementId: "e1",
  chainId: "near:localnet",
  escrowContractId: "escrow.localnet",
  assetStandard: "native",
  tokenContractId: null,
  amountSmallestUnits: "1000",
  symbol: "NEAR",
  decimals: 24,
  requesterNearAccountId: "a.localnet",
  providerNearAccountId: "b.localnet",
  status: "awaiting_wallet",
  createTxHash: null,
  fundTxHash: null,
  onChainEscrowId: null,
};

describe("deriveAcceptanceFundingUiPhase", () => {
  it("starts at idle without intent", () => {
    const phase = deriveAcceptanceFundingUiPhase(null, {
      confirmOpen: false,
      busy: false,
      activeStep: null,
      lastError: null,
      finalizedEngagementId: null,
    });
    assert.equal(phase, "idle");
  });

  it("shows confirm before prepare", () => {
    const phase = deriveAcceptanceFundingUiPhase(null, {
      confirmOpen: true,
      busy: false,
      activeStep: null,
      lastError: null,
      finalizedEngagementId: null,
    });
    assert.equal(phase, "confirm");
  });

  it("maps in-flight intent to resume", () => {
    const phase = deriveAcceptanceFundingUiPhase(
      { ...baseIntent, onChainEscrowId: "7" },
      {
        confirmOpen: false,
        busy: false,
        activeStep: null,
        lastError: null,
        finalizedEngagementId: null,
      },
    );
    assert.equal(phase, "resume");
  });

  it("maps busy fund step to single wallet approval", () => {
    const phase = deriveAcceptanceFundingUiPhase(baseIntent, {
      confirmOpen: false,
      busy: true,
      activeStep: "Waiting for wallet approval (fund escrow)…",
      lastError: null,
      finalizedEngagementId: null,
    });
    assert.equal(phase, "awaiting_fund_wallet");
  });

  it("maps submitted fund tx hash to fund_submitted", () => {
    const phase = deriveAcceptanceFundingUiPhase(
      { ...baseIntent, fundTxHash: "abc" },
      {
        confirmOpen: false,
        busy: false,
        activeStep: null,
        lastError: null,
        finalizedEngagementId: null,
      },
    );
    assert.equal(phase, "fund_submitted");
  });

  it("maps wallet cancel to wallet_rejected", () => {
    const phase = deriveAcceptanceFundingUiPhase(baseIntent, {
      confirmOpen: false,
      busy: false,
      activeStep: null,
      lastError: "User rejected the transaction",
      finalizedEngagementId: null,
    });
    assert.equal(phase, "wallet_rejected");
  });
});

describe("action affordances", () => {
  it("continue allowed on resume", () => {
    assert.equal(canContinueAcceptanceFunding("resume"), true);
  });

  it("retry allowed on failed and wallet_rejected", () => {
    assert.equal(canRetryAcceptanceFunding("failed"), true);
    assert.equal(canRetryAcceptanceFunding("wallet_rejected"), true);
    assert.equal(canRetryAcceptanceFunding("idle"), false);
  });

  it("blocks duplicate attempts while preparing", () => {
    assert.equal(blocksDuplicateFundingAttempt("preparing", false), true);
    assert.equal(blocksDuplicateFundingAttempt("idle", false), false);
  });

  it("continue hidden for failed terminal phase", () => {
    assert.equal(shouldShowContinueFunding("failed", true), false);
    assert.equal(shouldShowContinueFunding("resume", true), true);
  });
});
