"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "../database.types";
import { readBrowserSupabaseEnv } from "./env";

export function createClient() {
  const { url, anonKey } = readBrowserSupabaseEnv({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });

  return createBrowserClient<Database>(url, anonKey);
}

/** Returns null when env is missing (e.g. static analysis) instead of throwing. */
export function tryCreateClient() {
  try {
    return createClient();
  } catch {
    return null;
  }
}
