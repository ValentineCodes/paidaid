import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import test from "node:test";

import { KeyPairEd25519, PublicKey } from "@near-js/crypto";
import { serializeNep413 } from "@near-wallet-selector/core";

import { byteaToHex } from "./bytea-to-hex";
import {
  WALLET_LINK_RECIPIENT,
  buildWalletLinkMessage,
  walletChallengeNonceFromHex,
} from "./wallet-link";
import { verifyWalletLinkSignature } from "./verify-wallet-link-signature";

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

test("buildWalletLinkMessage is stable for verification", () => {
  const msg = buildWalletLinkMessage("Alice.Sandbox", "00000000-0000-4000-8000-000000000001");
  assert.match(msg, /alice\.sandbox/i);
  assert.match(msg, /00000000-0000-4000-8000-000000000001/);
});

test("verifyWalletLinkSignature accepts a valid NEP-413 signature", () => {
  const challengeId = "11111111-1111-4111-8111-111111111111";
  const account = "alice.sandbox";
  const nonce = randomBytes(32);
  const message = buildWalletLinkMessage(account, challengeId);
  const signed = signNep413TestMessage({
    message,
    recipient: WALLET_LINK_RECIPIENT,
    nonce,
  });
  const result = verifyWalletLinkSignature(
    {
      id: challengeId,
      near_account_id: account,
      nonce_hex: nonce.toString("hex"),
    },
    signed,
  );
  assert.equal(result.ok, true);
});

test("verifyWalletLinkSignature rejects account substitution", () => {
  const challengeId = "22222222-2222-4222-8222-222222222222";
  const nonce = randomBytes(32);
  const message = buildWalletLinkMessage("alice.sandbox", challengeId);
  const signed = signNep413TestMessage({
    message,
    recipient: WALLET_LINK_RECIPIENT,
    nonce,
  });
  const result = verifyWalletLinkSignature(
    {
      id: challengeId,
      near_account_id: "bob.sandbox",
      nonce_hex: nonce.toString("hex"),
    },
    { ...signed, accountId: "bob.sandbox" },
  );
  assert.equal(result.ok, false);
});

test("verifyWalletLinkSignature rejects wrong nonce", () => {
  const challengeId = "33333333-3333-4333-8333-333333333333";
  const nonce = randomBytes(32);
  const message = buildWalletLinkMessage("alice.sandbox", challengeId);
  const signed = signNep413TestMessage({
    message,
    recipient: WALLET_LINK_RECIPIENT,
    nonce,
  });
  const other = randomBytes(32);
  const result = verifyWalletLinkSignature(
    {
      id: challengeId,
      near_account_id: "alice.sandbox",
      nonce_hex: other.toString("hex"),
    },
    signed,
  );
  assert.equal(result.ok, false);
});

test("walletChallengeNonceFromHex validates length", () => {
  assert.throws(() => walletChallengeNonceFromHex("abcd"));
});

test("byteaToHex strips postgres prefix", () => {
  assert.equal(byteaToHex("\\xdeadbeef"), "deadbeef");
});

test("PublicKey.verify matches wallet-selector digest path", () => {
  const keyPair = KeyPairEd25519.fromRandom();
  const nonce = randomBytes(32);
  const serialized = serializeNep413({
    message: "test",
    recipient: WALLET_LINK_RECIPIENT,
    nonce,
  });
  const digest = createHash("sha256").update(serialized).digest();
  const sig = keyPair.sign(digest);
  const pub = PublicKey.from(keyPair.getPublicKey().toString());
  assert.equal(pub.verify(digest, sig.signature), true);
});
