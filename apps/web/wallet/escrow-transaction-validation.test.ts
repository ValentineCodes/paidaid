import assert from "node:assert/strict";
import test from "node:test";

import type { EngagementFundingPrepareResult } from "../lib/engagement/funding-types";
import {
  validateEscrowFundTerms,
  validateEscrowReleaseTerms,
} from "./escrow-transaction-validation";
import type { PaidAidNearTransactionSigner } from "./paidaid-near-transaction-signer";

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
  providerNearAccountId: "bob.sandbox",
  onChainEscrowId: null,
  status: "prepared",
  createTxHash: null,
  fundTxHash: null,
};

const signer: Pick<PaidAidNearTransactionSigner, "accountId" | "appNetworkId"> =
  {
    accountId: "alice.sandbox",
    appNetworkId: "localnet",
  };

test("validateEscrowFundTerms accepts aligned requester and network", () => {
  assert.doesNotThrow(() => validateEscrowFundTerms(signer, terms));
});

test("validateEscrowFundTerms rejects wrong connected account", () => {
  assert.throws(
    () => validateEscrowFundTerms({ ...signer, accountId: "mallory.sandbox" }, terms),
    /must be alice\.sandbox/i,
  );
});

test("validateEscrowFundTerms rejects network mismatch", () => {
  assert.throws(
    () =>
      validateEscrowFundTerms(
        { ...signer, appNetworkId: "testnet" },
        { ...terms, chainId: "near:localnet" },
      ),
    /network mismatch/i,
  );
});

test("validateEscrowReleaseTerms enforces requester wallet", () => {
  assert.throws(
    () =>
      validateEscrowReleaseTerms({
        signer: { accountId: "bob.sandbox", appNetworkId: "localnet" },
        escrowContractId: "escrow.sandbox",
        onChainEscrowId: "1",
        requesterNearAccountId: "alice.sandbox",
        appNetworkId: "localnet",
      }),
    /must be alice\.sandbox/i,
  );
});
