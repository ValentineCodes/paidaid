import type { SupabaseClient } from "@supabase/supabase-js";

import { syntheticEmailForNearAccount } from "./wallet-auth-email";

const DEFAULT_DISPLAY_NAME = "anonymous";

export type ProvisionWalletUserResult =
  | { ok: true; userId: string; email: string; created: boolean }
  | { ok: false; error: string };

/**
 * Resolves an existing user by wallet or creates auth.users + profile (idempotent).
 */
export async function provisionWalletUser(
  service: SupabaseClient,
  nearAccountId: string,
  publicKey: string,
  options?: { walletProviderId?: string | null },
): Promise<ProvisionWalletUserResult> {
  const account = nearAccountId.toLowerCase().trim();

  const { data: existingId, error: lookupError } = await service.rpc(
    "lookup_user_id_by_near_wallet",
    { p_near_account_id: account },
  );

  if (lookupError) {
    return { ok: false, error: lookupError.message };
  }

  if (existingId) {
    const { data: userRow, error: userError } =
      await service.auth.admin.getUserById(existingId);
    if (userError || !userRow.user?.email) {
      return { ok: false, error: userError?.message ?? "User not found." };
    }
    await service.auth.admin.updateUserById(existingId, {
      user_metadata: {
        ...userRow.user.user_metadata,
        primary_near_account_id: account,
        auth_provider: "near_wallet",
        ...(options?.walletProviderId
          ? { last_wallet_provider_id: options.walletProviderId }
          : {}),
      },
    });
    return {
      ok: true,
      userId: existingId,
      email: userRow.user.email,
      created: false,
    };
  }

  const email = syntheticEmailForNearAccount(account);
  const { data: created, error: createError } = await service.auth.admin.createUser(
    {
      email,
      email_confirm: true,
      user_metadata: {
        display_name: DEFAULT_DISPLAY_NAME,
        primary_near_account_id: account,
        auth_provider: "near_wallet",
        ...(options?.walletProviderId
          ? { last_wallet_provider_id: options.walletProviderId }
          : {}),
      },
    },
  );

  if (createError) {
    const msg = createError.message.toLowerCase();
    if (msg.includes("already") || msg.includes("registered")) {
      const { data: secondLookup } = await service.rpc(
        "lookup_user_id_by_near_wallet",
        { p_near_account_id: account },
      );
      if (secondLookup) {
        const { data: userRow } = await service.auth.admin.getUserById(secondLookup);
        if (userRow.user?.email) {
          return {
            ok: true,
            userId: secondLookup,
            email: userRow.user.email,
            created: false,
          };
        }
      }
    }
    return { ok: false, error: createError.message };
  }

  const userId = created.user?.id;
  if (!userId) {
    return { ok: false, error: "User provisioning failed." };
  }

  const { data: profile } = await service
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  if (!profile) {
    const { error: profileError } = await service.from("profiles").insert({
      id: userId,
      display_name: DEFAULT_DISPLAY_NAME,
    });
    if (profileError && profileError.code !== "23505") {
      return { ok: false, error: profileError.message };
    }
  }

  return {
    ok: true,
    userId,
    email: created.user.email ?? email,
    created: true,
  };
}
