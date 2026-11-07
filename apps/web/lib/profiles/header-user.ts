import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../database.types";
import { resolveProfileDisplayUrl } from "./resolve-photo";

export type HeaderUser = {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  /** Storage path or external URL — for client img remount after upload */
  avatarKey: string;
};

export async function loadHeaderUser(
  supabase: SupabaseClient<Database>,
  authUser: { id: string; email?: string | null },
): Promise<HeaderUser> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, avatar_url, live_profile_photo_path")
    .eq("id", authUser.id)
    .maybeSingle();

  const avatarUrl = await resolveProfileDisplayUrl(supabase, profile);
  const livePath = profile?.live_profile_photo_path?.trim() ?? "";
  const avatarKey =
    livePath ||
    profile?.avatar_url?.trim() ||
    authUser.id;

  return {
    id: authUser.id,
    email: authUser.email ?? "",
    displayName: profile?.display_name?.trim() ?? "",
    avatarUrl,
    avatarKey,
  };
}
