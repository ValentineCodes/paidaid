import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeSummaryAmount,
  paymentActivityCompletedCopy,
  paymentActivityKindLabel,
  paymentActivityStatusLabel,
} from "./payment-activity-format";

test("normalizeSummaryAmount keeps integer strings", () => {
  assert.equal(normalizeSummaryAmount("5000000000000000000000000"), "5000000000000000000000000");
  assert.equal(normalizeSummaryAmount("0"), "0");
  assert.equal(normalizeSummaryAmount(null), "0");
});

test("normalizeSummaryAmount handles small scientific notation", () => {
  assert.equal(normalizeSummaryAmount("1e+3"), "1000");
});

test("paymentActivityCompletedCopy is true only for success", () => {
  assert.equal(paymentActivityCompletedCopy("success"), true);
  assert.equal(paymentActivityCompletedCopy("pending"), false);
  assert.equal(paymentActivityCompletedCopy("failed"), false);
});

test("paymentActivityKindLabel maps known kinds", () => {
  assert.equal(paymentActivityKindLabel("funding"), "Funding");
  assert.equal(paymentActivityKindLabel("payout"), "Payout");
  assert.equal(paymentActivityKindLabel("refund"), "Refund");
});

test("paymentActivityStatusLabel distinguishes pending", () => {
  assert.equal(paymentActivityStatusLabel("pending"), "Pending");
  assert.equal(paymentActivityStatusLabel("success"), "Confirmed");
});
