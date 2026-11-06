import type { SupabaseClient } from "@supabase/supabase-js";

import { LIVE_PROFILE_PHOTOS_BUCKET } from "../constants/storage";
import type { Database, Tables } from "../database.types";
import { profileHasUsablePhoto } from "./photo";

type Client = SupabaseClient<Database>;

/** Public URL or a short-lived signed URL for a storage-backed profile photo. */
export async function resolveProfileDisplayUrl(
  supabase: Client,
  row: Pick<
    Tables<"profiles">,
    "avatar_url" | "live_profile_photo_path"
  > | null,
): Promise<string | null> {
  if (!row) {
    return null;
  }
  const path = row.live_profile_photo_path?.trim() ?? "";
  if (path.length > 0) {
    const { data } = await supabase.storage
      .from(LIVE_PROFILE_PHOTOS_BUCKET)
      .createSignedUrl(path, 3600);
    return data?.signedUrl ?? null;
  }
  const ext = row.avatar_url?.trim() ?? "";
  if (ext.length > 0) {
    return ext;
  }
  return null;
}

export function profileHasPhotoForGating(
  row: Pick<
    Tables<"profiles">,
    "avatar_url" | "live_profile_photo_path"
  > | null,
): boolean {
  return profileHasUsablePhoto(row);
}
