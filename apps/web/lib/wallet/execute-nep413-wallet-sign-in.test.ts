import assert from "node:assert/strict";
import test from "node:test";

import { executeNep413WalletSignIn } from "./execute-nep413-wallet-sign-in";

const challenge = {
  challengeId: "11111111-1111-4111-8111-111111111111",
  message: "Sign in to PaidAid",
  nonceHex: "ab".repeat(32),
  recipient: "paidaid",
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  issuedAt: "2025-11-08T12:00:00Z",
  nearAccountId: "alice.near",
  networkId: "testnet",
};

const caps = {
  signMessage: true,
  signAndSendTransaction: true,
  signAndSendTransactions: false,
  mainnet: true,
  testnet: true,
};

test("executeNep413WalletSignIn rejects wallets without signMessage", async () => {
  const result = await executeNep413WalletSignIn({
    challenge,
    connectedAccountId: "alice.near",
    capabilities: { ...caps, signMessage: false },
    signMessage: async () => ({
      accountId: "alice.near",
      publicKey: "pk",
      signature: "sig",
    }),
  });
  assert.equal(result.ok, false);
});

test("executeNep413WalletSignIn requires matching connected account", async () => {
  const result = await executeNep413WalletSignIn({
    challenge,
    connectedAccountId: "bob.near",
    capabilities: caps,
    signMessage: async () => ({
      accountId: "alice.near",
      publicKey: "pk",
      signature: "sig",
    }),
  });
  assert.equal(result.ok, false);
});

test("executeNep413WalletSignIn returns signature from wallet", async () => {
  const result = await executeNep413WalletSignIn({
    challenge,
    connectedAccountId: "alice.near",
    capabilities: caps,
    signMessage: async () => ({
      accountId: "alice.near",
      publicKey: "pk",
      signature: "sig",
    }),
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.signed.signature, "sig");
  }
});
