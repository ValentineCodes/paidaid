import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { LIVE_PROFILE_PHOTOS_BUCKET } from "../constants/storage";
import type { Database } from "../database.types";

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_BYTES = 5 * 1024 * 1024;

export function validateProfilePhotoFile(file: File): string | null {
  if (file.size === 0) {
    return "Choose an image file.";
  }
  if (!ALLOWED.has(file.type)) {
    return "Use JPEG, PNG, WebP, or GIF.";
  }
  if (file.size > MAX_BYTES) {
    return "Image must be 5 MB or smaller.";
  }
  return null;
}

export async function uploadProfilePhotoFile(
  supabase: SupabaseClient<Database>,
  userId: string,
  file: File,
): Promise<{ error: string | null }> {
  const validationError = validateProfilePhotoFile(file);
  if (validationError) {
    return { error: validationError };
  }

  const ext =
    file.type === "image/jpeg"
      ? "jpg"
      : file.type === "image/png"
        ? "png"
        : file.type === "image/webp"
          ? "webp"
          : "gif";
  const path = `${userId}/${randomUUID()}.${ext}`;

  const { error: upError } = await supabase.storage
    .from(LIVE_PROFILE_PHOTOS_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });

  if (upError) {
    return { error: upError.message };
  }

  const { error: rpcError } = await supabase.rpc("confirm_live_profile_photo", {
    p_storage_path: path,
  });
  if (rpcError) {
    return { error: rpcError.message };
  }

  return { error: null };
}
