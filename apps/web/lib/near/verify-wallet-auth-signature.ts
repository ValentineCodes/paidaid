import { verifySignature, type SignedMessage } from "@near-wallet-selector/core";

import {
  WALLET_AUTH_RECIPIENT,
  buildWalletAuthMessage,
  walletAuthNonceFromHex,
} from "./wallet-auth";

export type WalletAuthChallengeRow = {
  id: string;
  near_account_id: string;
  network_id: string;
  nonce_hex: string;
  issued_at?: string;
};

export function verifyWalletAuthSignature(
  challenge: WalletAuthChallengeRow,
  signed: SignedMessage,
  options?: {
    expectedMessage?: string;
    issuedAtIso?: string;
    networkId?: string;
    recipient?: string;
  },
): { ok: true } | { ok: false; reason: string } {
  const expectedAccount = challenge.near_account_id.toLowerCase();
  if (signed.accountId.toLowerCase() !== expectedAccount) {
    return { ok: false, reason: "Signed account does not match the challenge." };
  }

  const networkId = options?.networkId ?? challenge.network_id;
  const issuedAt = options?.issuedAtIso ?? challenge.issued_at;
  if (!issuedAt?.trim()) {
    return { ok: false, reason: "Challenge issue time missing." };
  }

  const recipient = options?.recipient ?? WALLET_AUTH_RECIPIENT;
  const canonical = buildWalletAuthMessage(
    expectedAccount,
    challenge.id,
    networkId,
    issuedAt,
    recipient,
  );
  const message = options?.expectedMessage ?? canonical;
  if (message !== canonical) {
    return {
      ok: false,
      reason: "Challenge message does not match bound identity.",
    };
  }

  let nonce: Buffer;
  try {
    nonce = walletAuthNonceFromHex(challenge.nonce_hex);
  } catch {
    return { ok: false, reason: "Challenge nonce is invalid." };
  }

  const valid = verifySignature({
    publicKey: signed.publicKey,
    signature: signed.signature,
    message,
    nonce,
    recipient,
  });

  if (!valid) {
    return { ok: false, reason: "Signature verification failed." };
  }

  return { ok: true };
}
