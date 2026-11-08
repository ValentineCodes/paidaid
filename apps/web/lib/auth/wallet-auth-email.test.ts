import assert from "node:assert/strict";
import test from "node:test";

import { syntheticEmailForNearAccount } from "./wallet-auth-email";

test("syntheticEmailForNearAccount is stable and unique per account", () => {
  const a = syntheticEmailForNearAccount("alice.sandbox");
  const b = syntheticEmailForNearAccount("alice.sandbox");
  const c = syntheticEmailForNearAccount("bob.sandbox");
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.match(a, /@auth\.paidaid\.local$/);
});
