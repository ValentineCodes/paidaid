import assert from "node:assert/strict";
import { test } from "node:test";

import { validateDeliveryProofFiles } from "./allowed-delivery-attachment";

test("validateDeliveryProofFiles rejects too many files", () => {
  const files = Array.from({ length: 11 }, () => new File([], "x.jpg"));
  const r = validateDeliveryProofFiles(files);
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.match(r.error, /10/);
  }
});

test("validateDeliveryProofFiles rejects PDF", () => {
  const f = new File([], "x.pdf", { type: "application/pdf" });
  const r = validateDeliveryProofFiles([f]);
  assert.equal(r.ok, false);
});

test("validateDeliveryProofFiles accepts jpeg", () => {
  const f = new File(["x"], "x.jpg", { type: "image/jpeg" });
  const r = validateDeliveryProofFiles([f]);
  assert.equal(r.ok, true);
});
