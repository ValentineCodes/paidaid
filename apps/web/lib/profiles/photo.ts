import type { Tables } from "../database.types";

/** True if the profile has an avatar for display in listings and cards. */
export function profileHasUsablePhoto(
  row: Pick<
    Tables<"profiles">,
    "avatar_url" | "live_profile_photo_path"
  > | null,
): boolean {
  if (!row) {
    return false;
  }
  const live = row.live_profile_photo_path?.trim() ?? "";
  if (live.length > 0) {
    return true;
  }
  const url = row.avatar_url?.trim() ?? "";
  return url.length > 0;
}
