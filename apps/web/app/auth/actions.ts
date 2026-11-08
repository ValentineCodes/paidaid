"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "../../lib/supabase/server";
import {
  validateDisplayName,
  validateProfileForm,
} from "../../lib/validation/profile";

export type ProfileUpdateState = {
  error: string | null;
  fieldErrors?: Record<string, string>;
  success?: boolean;
};

export async function updateProfile(
  _prev: ProfileUpdateState,
  formData: FormData,
): Promise<ProfileUpdateState> {
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

  const { error } = await supabase
    .from("profiles")
    .update({
      display_name: displayName.trim(),
      bio: bio === "" ? null : bio,
    })
    .eq("id", user.id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/account");
  return { error: null, success: true };
}

export async function signOut(): Promise<void> {
  const { signOutWalletSession } = await import("./wallet-actions");
  await signOutWalletSession();
}
