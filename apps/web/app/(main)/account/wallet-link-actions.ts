"use server";

import { verifySignature } from "@near-wallet-selector/core";
import { revalidatePath } from "next/cache";

import { byteaToHex } from "../../../lib/near/bytea-to-hex";
import {
  WALLET_LINK_RECIPIENT,
  buildWalletLinkMessage,
  walletChallengeNonceFromHex,
} from "../../../lib/near/wallet-link";
import { assertChallengeUsable } from "../../../lib/near/wallet-link-challenge-guards";
import { verifyWalletLinkSignature } from "../../../lib/near/verify-wallet-link-signature";
import { createClient } from "../../../lib/supabase/server";
import { createServiceClient } from "../../../lib/supabase/service";

export type WalletLinkActionState = {
  error: string | null;
  success?: boolean;
};

export type WalletLinkChallengePayload = {
  challengeId: string;
  message: string;
  nonceHex: string;
  recipient: string;
  expiresAt: string;
  nearAccountId: string;
};

export async function createWalletLinkChallenge(
  nearAccountId: string,
): Promise<
  { ok: true; challenge: WalletLinkChallengePayload } | { ok: false; error: string }
> {
  const account = nearAccountId.trim().toLowerCase();
  if (!account) {
    return { ok: false, error: "Connect a NEAR wallet first." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Sign in to link a wallet." };
  }

  const { data, error } = await supabase.rpc("create_near_wallet_link_challenge", {
    p_near_account_id: account,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  const row = data?.[0];
  if (!row) {
    return { ok: false, error: "Could not create link challenge." };
  }

  const recipient = String(row.recipient ?? WALLET_LINK_RECIPIENT);
  if (recipient !== WALLET_LINK_RECIPIENT) {
    return { ok: false, error: "Wallet link recipient mismatch." };
  }

  return {
    ok: true,
    challenge: {
      challengeId: row.challenge_id,
      message: row.message,
      nonceHex: row.nonce_hex,
      recipient,
      expiresAt: row.expires_at,
      nearAccountId: account,
    },
  };
}

export async function completeWalletLink(input: {
  challengeId: string;
  nearAccountId: string;
  recipient: string;
  nonceHex: string;
  signed: {
    accountId: string;
    publicKey: string;
    signature: string;
  };
}): Promise<WalletLinkActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Sign in to link a wallet." };
  }

  if (input.recipient !== WALLET_LINK_RECIPIENT) {
    return { error: "Invalid link recipient." };
  }

  const { data: challenge, error: challengeError } = await supabase
    .from("wallet_link_challenges")
    .select("id, near_account_id, nonce, expires_at, used_at, user_id")
    .eq("id", input.challengeId)
    .maybeSingle();

  if (challengeError || !challenge) {
    return { error: "Challenge not found or inaccessible." };
  }
  const guardError = assertChallengeUsable(
    {
      userId: challenge.user_id,
      usedAt: challenge.used_at,
      expiresAt: challenge.expires_at,
    },
    user.id,
    Date.now(),
  );
  if (guardError) {
    return { error: guardError };
  }

  const nonceHex = byteaToHex(String(challenge.nonce));
  const verification = verifyWalletLinkSignature(
    {
      id: challenge.id,
      near_account_id: challenge.near_account_id,
      nonce_hex: nonceHex,
    },
    input.signed,
  );
  if (!verification.ok) {
    return { error: verification.reason };
  }

  const expectedMessage = buildWalletLinkMessage(
    challenge.near_account_id,
    challenge.id,
  );
  let nonce: Buffer;
  try {
    nonce = walletChallengeNonceFromHex(nonceHex);
  } catch {
    return { error: "Invalid challenge nonce." };
  }

  if (
    !verifySignature({
      publicKey: input.signed.publicKey,
      signature: input.signed.signature,
      message: expectedMessage,
      nonce,
      recipient: input.recipient,
    })
  ) {
    return { error: "Signature verification failed." };
  }

  try {
    const service = createServiceClient();
    const { error: applyError } = await service.rpc("apply_near_wallet_link", {
      p_user_id: user.id,
      p_challenge_id: challenge.id,
      p_near_account_id: input.signed.accountId,
      p_public_key: input.signed.publicKey,
    });
    if (applyError) {
      return { error: applyError.message };
    }
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : "Wallet linking is not configured.";
    return { error: msg };
  }

  revalidatePath("/account");
  revalidatePath("/account/edit");
  return { error: null, success: true };
}

export async function unlinkNearWallet(): Promise<WalletLinkActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Sign in to manage your wallet." };
  }

  const { error } = await supabase.rpc("unlink_near_wallet");
  if (error) {
    return { error: error.message };
  }

  revalidatePath("/account");
  revalidatePath("/account/edit");
  return { error: null, success: true };
}
