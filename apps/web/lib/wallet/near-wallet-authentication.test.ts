import assert from "node:assert/strict";
import test from "node:test";

import {
  assertAuthAccountMatchesConnection,
  normalizeWalletProviderId,
  requireNep413SigningCapability,
} from "./near-wallet-authentication";

const fullCaps = {
  signMessage: true,
  signAndSendTransaction: true,
  signAndSendTransactions: false,
  mainnet: true,
  testnet: true,
};

test("requireNep413SigningCapability blocks wallets without signMessage", () => {
  assert.match(
    requireNep413SigningCapability({ ...fullCaps, signMessage: false }) ?? "",
    /signed messages/i,
  );
  assert.equal(requireNep413SigningCapability(fullCaps), null);
});

test("assertAuthAccountMatchesConnection enforces same connected account", () => {
  assert.equal(
    assertAuthAccountMatchesConnection("alice.near", "alice.near"),
    null,
  );
  assert.match(
    assertAuthAccountMatchesConnection("alice.near", "bob.near") ?? "",
    /same NEAR account/i,
  );
  assert.match(
    assertAuthAccountMatchesConnection("alice.near", "") ?? "",
    /Connect a NEAR wallet/i,
  );
});

test("normalizeWalletProviderId trims and bounds length", () => {
  assert.equal(normalizeWalletProviderId("  meteor-wallet "), "meteor-wallet");
  assert.equal(normalizeWalletProviderId(""), null);
  assert.equal(normalizeWalletProviderId("x"), null);
});
