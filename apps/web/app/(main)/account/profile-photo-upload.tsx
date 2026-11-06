"use client";

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";

import {
  uploadProfilePhotoFromFile,
  type UploadProfilePhotoState,
} from "./upload-profile-photo-action";

const initial: UploadProfilePhotoState = { error: null };

function SubmitLabel() {
  const { pending } = useFormStatus();
  return pending ? "Uploading…" : "Upload photo";
}

export function ProfilePhotoUpload() {
  const [state, action] = useActionState(uploadProfilePhotoFromFile, initial);
  const router = useRouter();

  useEffect(() => {
    if (state.uploadedAt) {
      router.refresh();
    }
  }, [state.uploadedAt, router]);

  return (
    <div className="form-fields border-b border-[var(--line)] pb-8">
      <h3 className="font-[700] text-[13px] text-[var(--ink)]">Profile photo</h3>
      <p className="text-[12px] font-normal text-[var(--muted)]">
        Used across the marketplace and required before you respond or message.
        JPEG, PNG, WebP, or GIF — up to 5 MB.
      </p>
      <form action={action} className="flex flex-col gap-3">
        <input
          name="profile_photo"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="text-[13px] text-[var(--ink)] file:mr-3 file:rounded-[9px] file:border file:border-[var(--line)] file:bg-[var(--surface)] file:px-3 file:py-2 file:text-[12px] file:font-[600]"
        />
        <button type="submit" className="primary w-fit">
          <SubmitLabel />
        </button>
      </form>
      {state.error ? (
        <p className="text-[12px] text-red-700 dark:text-red-300" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="text-[12px] text-[#378c62]">Photo saved.</p>
      ) : null}
    </div>
  );
}
