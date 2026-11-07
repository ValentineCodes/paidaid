"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "../../../lib/supabase/server";
import { uploadProfilePhotoFile } from "../../../lib/profiles/upload-profile-photo-file";

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

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "You must be signed in." };
  }

  const { error: photoError } = await uploadProfilePhotoFile(
    supabase,
    user.id,
    file,
  );
  if (photoError) {
    return { error: photoError };
  }

  revalidatePath("/account");
  revalidatePath("/account/edit");
  revalidatePath("/", "layout");
  revalidatePath("/messages", "layout");
  revalidatePath("/requests", "layout");
  revalidatePath("/notifications", "layout");
  return { error: null, success: true, uploadedAt: new Date().toISOString() };
}
