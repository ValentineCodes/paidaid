"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";

import { createClient } from "../../../lib/supabase/server";
import { LIVE_PROFILE_PHOTOS_BUCKET } from "../../../lib/constants/storage";

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_BYTES = 5 * 1024 * 1024;

export type UploadProfilePhotoState = {
  error: string | null;
  success?: boolean;
  /** Changes on each successful upload so the client can refresh again */
  uploadedAt?: string;
};

export async function uploadProfilePhotoFromFile(
  _prev: UploadProfilePhotoState,
  formData: FormData,
): Promise<UploadProfilePhotoState> {
  const file = formData.get("profile_photo");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose an image file." };
  }
  if (!ALLOWED.has(file.type)) {
    return { error: "Use JPEG, PNG, WebP, or GIF." };
  }
  if (file.size > MAX_BYTES) {
    return { error: "Image must be 5 MB or smaller." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "You must be signed in." };
  }

  const ext =
    file.type === "image/jpeg"
      ? "jpg"
      : file.type === "image/png"
        ? "png"
        : file.type === "image/webp"
          ? "webp"
          : "gif";
  const path = `${user.id}/${randomUUID()}.${ext}`;

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

  revalidatePath("/account");
  revalidatePath("/account/edit");
  revalidatePath("/", "layout");
  revalidatePath("/messages", "layout");
  revalidatePath("/requests", "layout");
  revalidatePath("/notifications", "layout");
  return { error: null, success: true, uploadedAt: new Date().toISOString() };
}
