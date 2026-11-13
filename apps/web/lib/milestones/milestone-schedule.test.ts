import test from "node:test";
import assert from "node:assert/strict";

import {
  defaultMilestoneDrafts,
  milestoneOfferTermsReady,
  sumSmallestUnitStrings,
  validateMilestoneDrafts,
} from "./milestone-schedule";

test("default milestone selection uses two milestones", () => {
  assert.equal(defaultMilestoneDrafts(2).length, 2);
});

test("validate requires 2–5 milestones", () => {
  const one = validateMilestoneDrafts(
    [{ position: 1, title: "A", description: "", amountHuman: "1" }],
    "1000000",
    6,
  );
  assert.equal(one.ok, false);
});

test("validate exact total matching", () => {
  const budget = "3000000";
  const drafts = [
    { position: 1, title: "First", description: "", amountHuman: "1" },
    { position: 2, title: "Second", description: "", amountHuman: "2" },
  ];
  const ok = validateMilestoneDrafts(drafts, budget, 6);
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.deepEqual(
      ok.rows.map((r) => r.amount),
      ["1000000", "2000000"],
    );
  }
});

test("rejects mismatched total", () => {
  const drafts = [
    { position: 1, title: "First", description: "", amountHuman: "1" },
    { position: 2, title: "Second", description: "", amountHuman: "1" },
  ];
  const bad = validateMilestoneDrafts(drafts, "3000000", 6);
  assert.equal(bad.ok, false);
});

test("sum uses bigint not float", () => {
  const sum = sumSmallestUnitStrings(["1000000000000000000000000", "1"]);
  assert.equal(sum, 1000000000000000000000001n);
});

test("USDC decimal inputs sum to budget without float drift", () => {
  const budget = "30750000";
  const drafts = [
    { position: 1, title: "First", description: "", amountHuman: "10.50" },
    { position: 2, title: "Second", description: "", amountHuman: "20.25" },
  ];
  const ok = validateMilestoneDrafts(drafts, budget, 6);
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.deepEqual(
      ok.rows.map((r) => r.amount),
      ["10500000", "20250000"],
    );
  }
});

test("NEAR fractional amount respects asset decimals", () => {
  const budget = "2500000000000000000000000";
  const drafts = [
    { position: 1, title: "First", description: "", amountHuman: "1" },
    { position: 2, title: "Second", description: "", amountHuman: "1.5" },
  ];
  const ok = validateMilestoneDrafts(drafts, budget, 24);
  assert.equal(ok.ok, true);
  if (ok.ok) {
    const sum = ok.rows.reduce(
      (acc, r) => acc + BigInt(r.amount),
      0n,
    );
    assert.equal(sum, BigInt(budget));
  }
});

test("milestone offer gating", () => {
  assert.equal(milestoneOfferTermsReady("single", "not_applicable"), true);
  assert.equal(milestoneOfferTermsReady("milestones", "proposal_pending"), false);
  assert.equal(milestoneOfferTermsReady("milestones", "agreed"), true);
  assert.equal(
    milestoneOfferTermsReady("milestones", "accepted_as_proposed"),
    true,
  );
});
