"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { issueSupabaseSessionForEmail } from "../../lib/auth/issue-supabase-session";
import { provisionWalletUser } from "../../lib/auth/provision-wallet-user";
import { byteaToHex } from "../../lib/near/bytea-to-hex";
import { assertWalletAuthChallengeUsable } from "../../lib/near/wallet-auth-challenge-guards";
import {
  WALLET_AUTH_RECIPIENT,
  buildWalletAuthMessage,
  formatWalletAuthIssuedAt,
} from "../../lib/near/wallet-auth";
import { verifyWalletAuthSignature } from "../../lib/near/verify-wallet-auth-signature";
import { formatWalletLinkError } from "../../lib/near/wallet-link-errors";
import { readPublicNearNetworkId } from "../../wallet/network-config";
import { createClient } from "../../lib/supabase/server";
import { createServiceClient } from "../../lib/supabase/service";

export type WalletAuthActionState = {
  error: string | null;
  success?: boolean;
};

export type WalletAuthChallengePayload = {
  challengeId: string;
  message: string;
  nonceHex: string;
  recipient: string;
  expiresAt: string;
  issuedAt: string;
  nearAccountId: string;
  networkId: string;
};

export async function createWalletAuthChallenge(
  nearAccountId: string,
): Promise<
  { ok: true; challenge: WalletAuthChallengePayload } | { ok: false; error: string }
> {
  const account = nearAccountId.trim().toLowerCase();
  if (!account) {
    return { ok: false, error: "Connect a NEAR wallet first." };
  }

  const networkId = readPublicNearNetworkId(process.env);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_wallet_auth_challenge", {
    p_near_account_id: account,
    p_network_id: networkId,
  });

  if (error) {
    return { ok: false, error: formatWalletLinkError(error.message) };
  }

  const row = data?.[0];
  if (!row) {
    return { ok: false, error: "Could not create sign-in challenge." };
  }

  const recipient = String(row.recipient ?? WALLET_AUTH_RECIPIENT);
  if (recipient !== WALLET_AUTH_RECIPIENT) {
    return { ok: false, error: "Sign-in recipient mismatch." };
  }

  const issuedAt = formatWalletAuthIssuedAt(String(row.issued_at ?? ""));
  const challengeId = String(row.challenge_id);
  const expectedMessage = buildWalletAuthMessage(
    account,
    challengeId,
    networkId,
    issuedAt,
    recipient,
  );
  if (String(row.message) !== expectedMessage) {
    return { ok: false, error: "Challenge message mismatch." };
  }

  return {
    ok: true,
    challenge: {
      challengeId,
      message: expectedMessage,
      nonceHex: row.nonce_hex,
      recipient,
      expiresAt: row.expires_at,
      issuedAt,
      nearAccountId: account,
      networkId,
    },
  };
}

export async function runWalletAuthenticationCore(input: {
  challengeId: string;
  nearAccountId: string;
  networkId: string;
  message: string;
  recipient: string;
  nonceHex: string;
  issuedAt: string;
  signed: {
    accountId: string;
    publicKey: string;
    signature: string;
  };
  walletProviderId?: string | null;
}): Promise<WalletAuthActionState> {
  if (input.recipient !== WALLET_AUTH_RECIPIENT) {
    return { error: "Invalid sign-in recipient." };
  }

  const configuredNetwork = readPublicNearNetworkId(process.env);
  if (input.networkId.trim().toLowerCase() !== configuredNetwork) {
    return { error: "Network does not match this application." };
  }

  const supabase = await createClient();
  const {
    data: { user: sessionUser },
  } = await supabase.auth.getUser();

  const account = input.nearAccountId.trim().toLowerCase();
  const nowMs = Date.now();

  let service;
  try {
    service = createServiceClient();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Wallet sign-in is not configured.";
    return { error: msg };
  }

  const { data: challenge, error: challengeError } = await service
    .from("wallet_auth_challenges")
    .select("id, near_account_id, network_id, nonce, expires_at, used_at")
    .eq("id", input.challengeId)
    .maybeSingle();

  if (challengeError || !challenge) {
    return { error: "Challenge not found." };
  }

  const guardError = assertWalletAuthChallengeUsable(
    {
      usedAt: challenge.used_at,
      expiresAt: challenge.expires_at,
      nearAccountId: challenge.near_account_id,
      networkId: challenge.network_id,
    },
    account,
    configuredNetwork,
    nowMs,
  );
  if (guardError) {
    return { error: guardError };
  }

  const nonceHex = byteaToHex(String(challenge.nonce));
  const expectedMessage = buildWalletAuthMessage(
    challenge.near_account_id,
    challenge.id,
    challenge.network_id,
    input.issuedAt,
    input.recipient,
  );
  if (input.message !== expectedMessage) {
    return { error: "Challenge message mismatch." };
  }

  const verification = verifyWalletAuthSignature(
    {
      id: challenge.id,
      near_account_id: challenge.near_account_id,
      network_id: challenge.network_id,
      nonce_hex: nonceHex,
      issued_at: input.issuedAt,
    },
    input.signed,
    { expectedMessage, issuedAtIso: input.issuedAt, networkId: configuredNetwork },
  );
  if (!verification.ok) {
    return { error: verification.reason };
  }

  const provision = await provisionWalletUser(
    service,
    input.signed.accountId,
    input.signed.publicKey,
    { walletProviderId: input.walletProviderId ?? null },
  );
  if (!provision.ok) {
    return { error: provision.error };
  }

  const { error: completeError } = await service.rpc("complete_wallet_authentication", {
    p_challenge_id: challenge.id,
    p_user_id: provision.userId,
    p_near_account_id: input.signed.accountId,
    p_public_key: input.signed.publicKey,
    p_network_id: configuredNetwork,
    p_wallet_provider_id: input.walletProviderId ?? undefined,
  });
  if (completeError) {
    return { error: formatWalletLinkError(completeError.message) };
  }

  if (sessionUser && sessionUser.id !== provision.userId) {
    await supabase.auth.signOut();
  }

  const sessionResult = await issueSupabaseSessionForEmail(
    supabase,
    service,
    provision.email,
  );
  if (sessionResult.error) {
    return { error: sessionResult.error };
  }

  revalidatePath("/", "layout");
  return { error: null, success: true };
}

export async function completeWalletAuthentication(input: {
  challengeId: string;
  nearAccountId: string;
  networkId: string;
  message: string;
  recipient: string;
  nonceHex: string;
  issuedAt: string;
  signed: {
    accountId: string;
    publicKey: string;
    signature: string;
  };
  walletProviderId?: string | null;
  next?: string;
}): Promise<WalletAuthActionState> {
  const core = await runWalletAuthenticationCore(input);
  if (core.error) {
    return core;
  }
  const next = input.next?.trim() || "/";
  if (next.startsWith("/") && !next.startsWith("//")) {
    redirect(next);
  }
  redirect("/");
}

export async function clearWalletSession(): Promise<{ error: string | null }> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  return { error: null };
}

export async function signOutWalletSession(): Promise<void> {
  await clearWalletSession();
  redirect("/");
}
