/**
 * Validates Supabase public + server env for the web app.
 * Service role key must never be required for browser code.
 */

export type PublicSupabaseEnv = {
  url: string;
  anonKey: string;
};

export type ServerSupabaseEnv = PublicSupabaseEnv;

const URL_KEYS = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL"] as const;

const ANON_KEYS = [
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
] as const;

function firstDefined(
  env: Record<string, string | undefined>,
  keys: readonly string[],
): string | undefined {
  for (const key of keys) {
    const v = env[key]?.trim();
    if (v) {
      return v;
    }
  }
  return undefined;
}

/** For browser: requires NEXT_PUBLIC_* only. */
export function readBrowserSupabaseEnv(
  env: Record<string, string | undefined>,
): PublicSupabaseEnv {
  const url = firstDefined(env, URL_KEYS);
  const anonKey = firstDefined(env, ANON_KEYS);
  if (!url || !anonKey) {
    throw new Error(
      "Missing Supabase browser env: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must be a valid URL");
  }
  const isLocalHttp =
    parsed.protocol === "http:" &&
    (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1");
  if (parsed.protocol !== "https:" && !isLocalHttp) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL must use https (or http://127.0.0.1 / http://localhost for local Supabase)",
    );
  }
  return { url, anonKey };
}

/** For server/middleware: prefers NEXT_PUBLIC_* with fallback to server-only names. */
export function readServerSupabaseEnv(
  env: Record<string, string | undefined>,
): ServerSupabaseEnv {
  return readBrowserSupabaseEnv(env);
}

export function tryPublicSupabaseConfig(): PublicSupabaseEnv | null {
  try {
    return readBrowserSupabaseEnv({
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    });
  } catch {
    return null;
  }
}

/** Server or middleware: true if Supabase URL + anon key are present. */
export function isSupabaseConfigured(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return Boolean(
    firstDefined(env, [...URL_KEYS]) && firstDefined(env, [...ANON_KEYS]),
  );
}
