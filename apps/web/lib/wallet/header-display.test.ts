import assert from "node:assert/strict";
import test from "node:test";

import {
  nearAccountsMatch,
  resolveHeaderWalletSyncState,
  truncateNearAccountId,
} from "./header-display";

test("truncateNearAccountId shortens long ids", () => {
  const long = "verylongaccountname.sandbox";
  const out = truncateNearAccountId(long, 16);
  assert.ok(out.length <= 20);
  assert.match(out, /very|sandbox|…/);
});

test("nearAccountsMatch is case insensitive", () => {
  assert.equal(nearAccountsMatch("Alice.Sandbox", "alice.sandbox"), true);
  assert.equal(nearAccountsMatch("a.sandbox", "b.sandbox"), false);
});

test("resolveHeaderWalletSyncState covers alignment cases", () => {
  assert.equal(
    resolveHeaderWalletSyncState({
      hasSession: false,
      sessionNearAccountId: null,
      selectorAccountId: null,
    }),
    "signed_out",
  );
  assert.equal(
    resolveHeaderWalletSyncState({
      hasSession: true,
      sessionNearAccountId: "alice.sandbox",
      selectorAccountId: "bob.sandbox",
    }),
    "mismatch",
  );
  assert.equal(
    resolveHeaderWalletSyncState({
      hasSession: true,
      sessionNearAccountId: "alice.sandbox",
      selectorAccountId: "alice.sandbox",
    }),
    "aligned",
  );
});
