"use client";

import { useSearchParams } from "next/navigation";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { signUpWithPassword, type AuthFormState } from "../../../auth/actions";

const initialState: AuthFormState = { error: null };

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-stone-900 py-2.5 text-sm font-medium text-white transition hover:bg-stone-800 disabled:opacity-60 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-200"
    >
      {pending ? "Creating account…" : label}
    </button>
  );
}

export function SignUpForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/";
  const [showPassword, setShowPassword] = useState(false);
  const [state, formAction] = useActionState(signUpWithPassword, initialState);

  if (state.success) {
    return (
      <div className="rounded-lg border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-800 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200">
        Check your email to confirm your account if required by your Supabase
        project. You can sign in once confirmation completes.
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />
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
          autoComplete="name"
          className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-stone-900 outline-none ring-stone-400 focus:ring-2 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100"
        />
        <p className="text-xs text-stone-500">2–80 characters</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="email"
          className="text-sm font-medium text-stone-700 dark:text-stone-300"
        >
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-stone-900 outline-none ring-stone-400 focus:ring-2 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="password"
          className="text-sm font-medium text-stone-700 dark:text-stone-300"
        >
          Password
        </label>
        <div className="flex gap-2">
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            required
            minLength={8}
            className="min-w-0 flex-1 rounded-lg border border-stone-300 bg-white px-3 py-2 text-stone-900 outline-none ring-stone-400 focus:ring-2 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="shrink-0 rounded-lg border border-stone-300 px-3 py-2 text-xs font-medium text-stone-700 hover:bg-stone-100 dark:border-stone-600 dark:text-stone-300 dark:hover:bg-stone-800"
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        </div>
        <p className="text-xs text-stone-500">At least 8 characters</p>
      </div>
      {state.error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {state.error}
        </p>
      )}
      <SubmitButton label="Create account" />
    </form>
  );
}
