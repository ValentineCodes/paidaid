import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import test from "node:test";

import { KeyPairEd25519 } from "@near-js/crypto";
import { serializeNep413 } from "@near-wallet-selector/core";

import {
  WALLET_AUTH_RECIPIENT,
  buildWalletAuthMessage,
  formatWalletAuthIssuedAt,
  walletAuthNonceFromHex,
} from "./wallet-auth";
import { assertWalletAuthChallengeUsable } from "./wallet-auth-challenge-guards";
import { verifyWalletAuthSignature } from "./verify-wallet-auth-signature";

function signNep413TestMessage(input: {
  message: string;
  recipient: string;
  nonce: Buffer;
}): { accountId: string; publicKey: string; signature: string } {
  const keyPair = KeyPairEd25519.fromRandom();
  const serialized = serializeNep413({
    message: input.message,
    recipient: input.recipient,
    nonce: input.nonce,
  });
  const digest = createHash("sha256").update(serialized).digest();
  const sig = keyPair.sign(digest);
  return {
    accountId: "alice.sandbox",
    publicKey: keyPair.getPublicKey().toString(),
    signature: Buffer.from(sig.signature).toString("base64"),
  };
}

test("formatWalletAuthIssuedAt strips sub-second precision for Postgres parity", () => {
  assert.equal(
    formatWalletAuthIssuedAt("2025-11-08T12:00:00.123456+00:00"),
    "2025-11-08T12:00:00Z",
  );
  assert.equal(formatWalletAuthIssuedAt("2025-11-08T12:00:00Z"), "2025-11-08T12:00:00Z");
});

test("buildWalletAuthMessage binds account, challenge, network, recipient, issued", () => {
  const issued = "2025-11-08T12:00:00Z";
  const msg = buildWalletAuthMessage(
    "Alice.Sandbox",
    "00000000-0000-4000-8000-000000000001",
    "localnet",
    issued,
  );
  assert.match(msg, /alice\.sandbox/i);
  assert.match(msg, /Network localnet/);
  assert.match(msg, /Recipient paidaid/);
  assert.match(msg, new RegExp(issued.replace(/\[/g, "\\[")));
});

test("verifyWalletAuthSignature accepts a valid NEP-413 signature", () => {
  const challengeId = "11111111-1111-4111-8111-111111111111";
  const account = "alice.sandbox";
  const issued = "2025-11-08T12:00:00Z";
  const nonce = randomBytes(32);
  const message = buildWalletAuthMessage(account, challengeId, "localnet", issued);
  const signed = signNep413TestMessage({
    message,
    recipient: WALLET_AUTH_RECIPIENT,
    nonce,
  });
  const result = verifyWalletAuthSignature(
    {
      id: challengeId,
      near_account_id: account,
      network_id: "localnet",
      nonce_hex: nonce.toString("hex"),
      issued_at: issued,
    },
    signed,
    { expectedMessage: message, issuedAtIso: issued, networkId: "localnet" },
  );
  assert.equal(result.ok, true);
});

test("verifyWalletAuthSignature rejects wrong account", () => {
  const challengeId = "22222222-2222-4222-8222-222222222222";
  const nonce = randomBytes(32);
  const issued = "2025-11-08T12:00:00Z";
  const message = buildWalletAuthMessage("alice.sandbox", challengeId, "localnet", issued);
  const signed = signNep413TestMessage({
    message,
    recipient: WALLET_AUTH_RECIPIENT,
    nonce,
  });
  signed.accountId = "bob.sandbox";
  const result = verifyWalletAuthSignature(
    {
      id: challengeId,
      near_account_id: "alice.sandbox",
      network_id: "localnet",
      nonce_hex: nonce.toString("hex"),
    },
    signed,
    { expectedMessage: message, issuedAtIso: issued },
  );
  assert.equal(result.ok, false);
});

test("verifyWalletAuthSignature rejects audience/message mismatch", () => {
  const challengeId = "33333333-3333-4333-8333-333333333333";
  const nonce = randomBytes(32);
  const issued = "2025-11-08T12:00:00Z";
  const message = buildWalletAuthMessage("alice.sandbox", challengeId, "localnet", issued);
  const signed = signNep413TestMessage({
    message,
    recipient: WALLET_AUTH_RECIPIENT,
    nonce,
  });
  const tampered = buildWalletAuthMessage(
    "alice.sandbox",
    challengeId,
    "testnet",
    issued,
  );
  const result = verifyWalletAuthSignature(
    {
      id: challengeId,
      near_account_id: "alice.sandbox",
      network_id: "localnet",
      nonce_hex: nonce.toString("hex"),
    },
    signed,
    { expectedMessage: tampered, issuedAtIso: issued, networkId: "testnet" },
  );
  assert.equal(result.ok, false);
});

test("assertWalletAuthChallengeUsable enforces expiry and replay", () => {
  const base = {
    nearAccountId: "alice.sandbox",
    networkId: "localnet",
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    usedAt: null as string | null,
  };
  assert.equal(
    assertWalletAuthChallengeUsable(base, "alice.sandbox", "localnet", Date.now()),
    null,
  );
  assert.match(
    assertWalletAuthChallengeUsable(
      { ...base, usedAt: new Date().toISOString() },
      "alice.sandbox",
      "localnet",
      Date.now(),
    ) ?? "",
    /already used/i,
  );
  assert.match(
    assertWalletAuthChallengeUsable(
      { ...base, expiresAt: new Date(Date.now() - 1000).toISOString() },
      "alice.sandbox",
      "localnet",
      Date.now(),
    ) ?? "",
    /expired/i,
  );
  assert.match(
    assertWalletAuthChallengeUsable(base, "bob.sandbox", "localnet", Date.now()) ?? "",
    /account/i,
  );
  assert.match(
    assertWalletAuthChallengeUsable(base, "alice.sandbox", "testnet", Date.now()) ?? "",
    /network/i,
  );
});

test("walletAuthNonceFromHex rejects malformed nonce", () => {
  assert.throws(() => walletAuthNonceFromHex("abc"), /invalid/i);
});

test("buildWalletAuthMessage supports mainnet network binding", () => {
  const msg = buildWalletAuthMessage(
    "alice.near",
    "00000000-0000-4000-8000-000000000001",
    "mainnet",
    "2025-11-08T12:00:00Z",
  );
  assert.match(msg, /Network mainnet/);
  assert.match(msg, /Sign in to PaidAid/i);
});
