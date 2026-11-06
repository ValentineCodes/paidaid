"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { updateProfile, type ProfileUpdateState } from "../../auth/actions";
import type { Tables } from "../../../lib/database.types";

const initialState: ProfileUpdateState = { error: null };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-stone-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-stone-800 disabled:opacity-60 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-200"
    >
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
    <form action={formAction} className="flex max-w-lg flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="display_name"
          className="text-sm font-medium text-stone-700 dark:text-stone-300"
        >
          Display name
        </label>
        <input
          id="display_name"
          name="display_name"
          type="text"
          required
          minLength={2}
          maxLength={80}
          defaultValue={profile.display_name}
          className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-stone-900 outline-none ring-stone-400 focus:ring-2 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100"
        />
        {state.fieldErrors?.displayName && (
          <p className="text-sm text-red-700 dark:text-red-300">
            {state.fieldErrors.displayName}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="bio"
          className="text-sm font-medium text-stone-700 dark:text-stone-300"
        >
          Bio (optional)
        </label>
        <textarea
          id="bio"
          name="bio"
          rows={4}
          maxLength={500}
          defaultValue={profile.bio ?? ""}
          className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-stone-900 outline-none ring-stone-400 focus:ring-2 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100"
        />
        {state.fieldErrors?.bio && (
          <p className="text-sm text-red-700 dark:text-red-300">
            {state.fieldErrors.bio}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="avatar_url"
          className="text-sm font-medium text-stone-700 dark:text-stone-300"
        >
          Avatar URL (optional)
        </label>
        <input
          id="avatar_url"
          name="avatar_url"
          type="url"
          placeholder="https://…"
          defaultValue={profile.avatar_url ?? ""}
          className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-stone-900 outline-none ring-stone-400 focus:ring-2 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100"
        />
        {state.fieldErrors?.avatarUrl && (
          <p className="text-sm text-red-700 dark:text-red-300">
            {state.fieldErrors.avatarUrl}
          </p>
        )}
      </div>
      {state.error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
          Profile saved.
        </p>
      )}
      <SubmitButton />
    </form>
  );
}
