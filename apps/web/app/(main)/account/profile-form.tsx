"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { updateProfile, type ProfileUpdateState } from "../../auth/actions";
import type { Tables } from "../../../lib/database.types";
const initialState: ProfileUpdateState = { error: null };

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
};

export function ProfileForm({ profile }: ProfileFormProps) {
  const [state, formAction] = useActionState(updateProfile, initialState);

  return (
    <form action={formAction} className="form-fields">
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
