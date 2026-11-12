import assert from "node:assert/strict";
import test from "node:test";
import {
  assertEscrowRecordMatchesFunding,
  assertEscrowReleasedOnChain,
  assertFundingCompleteOnChain,
  normalizeTransactionOutcome,
  parseEscrowIdFromCreateOutcome,
  parseNearU64ReturnValue,
} from "./escrow";

test("parseNearU64ReturnValue accepts string and wrapper", () => {
  assert.equal(parseNearU64ReturnValue("42"), "42");
  assert.equal(parseNearU64ReturnValue({ "0": "7" }), "7");
});

test("parseEscrowIdFromCreateOutcome reads SuccessValue", () => {
  const encoded = Buffer.from(JSON.stringify("99"), "utf8").toString("base64");
  const id = parseEscrowIdFromCreateOutcome({
    status: { SuccessValue: encoded },
  });
  assert.equal(id, "99");
});

test("parseEscrowIdFromCreateOutcome follows receipt SuccessValue", () => {
  const encoded = Buffer.from(JSON.stringify({ "0": "12" }), "utf8").toString(
    "base64",
  );
  const id = parseEscrowIdFromCreateOutcome({
    status: "Started",
    receipts_outcome: [
      {
        id: "r1",
        outcome: { status: { SuccessValue: encoded } },
      },
    ],
  });
  assert.equal(id, "12");
});

test("normalizeTransactionOutcome unwraps Intear-style entry arrays", () => {
  const encoded = Buffer.from(JSON.stringify("77"), "utf8").toString("base64");
  const id = parseEscrowIdFromCreateOutcome(
    normalizeTransactionOutcome([
      ["status", { SuccessValue: encoded }],
      ["receipts_outcome", []],
    ]),
  );
  assert.equal(id, "77");
});

test("parseEscrowIdFromCreateOutcome may read NEP-141 tokens-used zero (not an escrow id)", () => {
  const encoded = Buffer.from(JSON.stringify("0"), "utf8").toString("base64");
  const id = parseEscrowIdFromCreateOutcome({
    status: { SuccessValue: encoded },
  });
  assert.equal(id, "0");
});

test("parseEscrowIdFromCreateOutcome follows SuccessReceiptId chain", () => {
  const encoded = Buffer.from(JSON.stringify("3"), "utf8").toString("base64");
  const id = parseEscrowIdFromCreateOutcome({
    status: { SuccessReceiptId: "r1" },
    receipts_outcome: [
      {
        id: "r1",
        outcome: { status: { SuccessValue: encoded } },
      },
    ],
  });
  assert.equal(id, "3");
});

test("assertFundingCompleteOnChain requires Funded and deposited", () => {
  const expected = {
    engagementId: "eng-1",
    requesterNearAccountId: "alice.near",
    providerNearAccountId: "bob.near",
    amountSmallestUnits: "1000",
    assetStandard: "native" as const,
    ftContractId: null,
  };
  const record = {
    engagement_id: "eng-1",
    requester: "alice.near",
    provider: "bob.near",
    asset: "Native" as const,
    ft_contract: null,
    amount: "1000",
    deposited: "1000",
    status: "Funded" as const,
  };
  assert.doesNotThrow(() =>
    assertFundingCompleteOnChain(record, expected),
  );
  assert.throws(() =>
    assertEscrowRecordMatchesFunding(
      { ...record, engagement_id: "other" },
      expected,
    ),
  );
});

test("assertEscrowReleasedOnChain requires Released status", () => {
  assert.throws(() =>
    assertEscrowReleasedOnChain({
      engagement_id: "e",
      requester: "a",
      provider: "b",
      asset: "Native",
      ft_contract: null,
      amount: "1",
      deposited: "1",
      status: "Funded",
    }),
  );
});

test("assertEscrowRecordMatchesFunding accepts RPC scientific amount", () => {
  const fiveNear = BigInt(5) * BigInt(10) ** BigInt(24);
  const expected = {
    engagementId: "eng-1",
    requesterNearAccountId: "alice.near",
    providerNearAccountId: "bob.near",
    amountSmallestUnits: fiveNear.toString(),
    assetStandard: "native" as const,
    ftContractId: null,
  };
  const record = {
    engagement_id: "eng-1",
    requester: "alice.near",
    provider: "bob.near",
    asset: "Native" as const,
    ft_contract: null,
    amount: 5e24,
    deposited: 0,
    status: "Pending" as const,
  };
  assert.doesNotThrow(() =>
    assertEscrowRecordMatchesFunding(record, expected),
  );
});
