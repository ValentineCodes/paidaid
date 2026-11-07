"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "../../../lib/supabase/server";
import { uploadProfilePhotoFile } from "../../../lib/profiles/upload-profile-photo-file";
import { validateProfileForm } from "../../../lib/validation/profile";

export type SaveEditProfileState = {
  error: string | null;
  fieldErrors?: Record<string, string>;
  success?: boolean;
};

export async function saveEditProfile(
  _prev: SaveEditProfileState,
  formData: FormData,
): Promise<SaveEditProfileState> {
  const displayName = String(formData.get("display_name") ?? "");
  const bio = String(formData.get("bio") ?? "").trim();

  const fieldErrors = validateProfileForm({
    displayName,
    bio: bio === "" ? null : bio,
  });

  if (fieldErrors) {
    return { error: null, fieldErrors };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in." };
  }

  const { error: updateError } = await supabase
    .from("profiles")
    .update({
      display_name: displayName.trim(),
      bio: bio === "" ? null : bio,
    })
    .eq("id", user.id);

  if (updateError) {
    return { error: updateError.message };
  }

  const photo = formData.get("profile_photo");
  if (photo instanceof File && photo.size > 0) {
    const { error: photoError } = await uploadProfilePhotoFile(
      supabase,
      user.id,
      photo,
    );
    if (photoError) {
      return {
        error: `Profile saved but photo failed: ${photoError}`,
      };
    }
  }

  revalidatePath("/account");
  revalidatePath("/account/edit");
  revalidatePath("/", "layout");
  revalidatePath("/messages", "layout");
  revalidatePath("/requests", "layout");
  revalidatePath("/notifications", "layout");

  return { error: null, success: true };
}
