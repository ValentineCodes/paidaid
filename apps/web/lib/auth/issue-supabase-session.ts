import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Establishes a browser session via verified magic-link token exchange.
 * Uses the user-scoped SSR client so HttpOnly cookies are set correctly.
 */
export async function issueSupabaseSessionForEmail(
  browserClient: SupabaseClient,
  serviceClient: SupabaseClient,
  email: string,
): Promise<{ error: string | null }> {
  const { data: linkData, error: linkError } =
    await serviceClient.auth.admin.generateLink({
      type: "magiclink",
      email: email.trim(),
    });

  if (linkError) {
    return { error: linkError.message };
  }

  const tokenHash = linkData.properties?.hashed_token;
  if (!tokenHash) {
    return { error: "Could not issue sign-in session." };
  }

  const { error: sessionError } = await browserClient.auth.verifyOtp({
    token_hash: tokenHash,
    type: "email",
  });

  if (sessionError) {
    return { error: sessionError.message };
  }

  return { error: null };
}
