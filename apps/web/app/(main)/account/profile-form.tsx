"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";

import { FigmaIcon } from "../../../components/figma-icons";
import type { Tables } from "../../../lib/database.types";
import {
  saveEditProfile,
  type SaveEditProfileState,
} from "./save-edit-profile-action";

const initialState: SaveEditProfileState = { error: null };

function displayInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase() || "?";
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="primary" disabled={pending}>
      {pending ? "Saving…" : "Save profile"}
    </button>
  );
}

type ProfileFormProps = {
  profile: Tables<"profiles">;
  photoDisplayUrl: string | null;
};

export function ProfileForm({ profile, photoDisplayUrl }: ProfileFormProps) {
  const [state, formAction] = useActionState(saveEditProfile, initialState);
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(
    photoDisplayUrl?.trim() ? photoDisplayUrl : null,
  );
  const [localPhotoError, setLocalPhotoError] = useState<string | null>(null);

  useEffect(() => {
    setPreviewUrl((prev) => {
      if (prev?.startsWith("blob:")) {
        return prev;
      }
      return photoDisplayUrl?.trim() ? photoDisplayUrl : null;
    });
  }, [photoDisplayUrl]);

  useEffect(() => {
    if (!state.success) {
      return;
    }
    setPreviewUrl((prev) => {
      if (prev?.startsWith("blob:")) {
        URL.revokeObjectURL(prev);
      }
      return photoDisplayUrl?.trim() ? photoDisplayUrl : null;
    });
    router.refresh();
  }, [state.success, photoDisplayUrl, router]);

  useEffect(() => {
    return () => {
      if (previewUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  function openFilePicker() {
    fileInputRef.current?.click();
  }

  function onPhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setLocalPhotoError(null);
    if (!file) {
      return;
    }
    const allowed = new Set([
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
    ]);
    if (!allowed.has(file.type)) {
      setLocalPhotoError("Use JPEG, PNG, WebP, or GIF.");
      e.target.value = "";
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setLocalPhotoError("Image must be 5 MB or smaller.");
      e.target.value = "";
      return;
    }
    if (previewUrl?.startsWith("blob:")) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(URL.createObjectURL(file));
  }

  const initials = displayInitials(profile.display_name);

  return (
    <form
      action={formAction}
      encType="multipart/form-data"
      className="form-fields"
    >
      <div className="profile-edit-avatar-block">
        <button
          type="button"
          className="profile-avatar profile-avatar--editable"
          onClick={openFilePicker}
          aria-label="Choose profile photo"
        >
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- blob + signed URLs
            <img
              src={previewUrl}
              alt=""
              className="size-full rounded-full object-cover"
            />
          ) : (
            <span className="profile-avatar-initials">{initials}</span>
          )}
          <span className="profile-avatar-badge" aria-hidden>
            <FigmaIcon name="edit" size={14} />
          </span>
        </button>
        <input
          ref={fileInputRef}
          name="profile_photo"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="sr-only"
          onChange={onPhotoChange}
        />
        {localPhotoError ? (
          <p className="text-[12px] text-red-700 dark:text-red-300" role="alert">
            {localPhotoError}
          </p>
        ) : null}
      </div>

      <label>
        Display name
        <input
          id="display_name"
          name="display_name"
          type="text"
          required
          minLength={2}
          maxLength={80}
          defaultValue={profile.display_name}
        />
        {state.fieldErrors?.displayName ? (
          <span className="text-[12px] font-normal text-red-700">
            {state.fieldErrors.displayName}
          </span>
        ) : null}
      </label>
      <label>
        Bio (optional)
        <textarea
          id="bio"
          name="bio"
          rows={4}
          maxLength={500}
          defaultValue={profile.bio ?? ""}
        />
        {state.fieldErrors?.bio ? (
          <span className="text-[12px] font-normal text-red-700">
            {state.fieldErrors.bio}
          </span>
        ) : null}
      </label>
      {state.error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[13px] text-emerald-900">
          Profile saved.
        </p>
      ) : null}
      <SubmitButton />
    </form>
  );
}
