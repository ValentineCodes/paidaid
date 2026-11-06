import { Suspense } from "react";
import Link from "next/link";

import { SignUpForm } from "./sign-up-form";
import { isSupabaseConfigured } from "../../../../lib/supabase/env";

export default function SignUpPage() {
  if (!isSupabaseConfigured()) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-6 py-16">
        <h1 className="text-3xl font-semibold tracking-tight">Sign up</h1>
        <p className="text-stone-600 dark:text-stone-400">
          Add Supabase keys to{" "}
          <code className="font-mono text-sm">apps/web/.env.local</code> (see{" "}
          <code className="font-mono text-sm">.env.example</code>) to enable
          registration.
        </p>
        <Link href="/" className="text-sm font-medium underline">
          Back to home
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-8 px-6 py-16">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Sign up</h1>
        <p className="text-stone-600 dark:text-stone-400">
          Create an account with email and password. Your display name is shown
          on your profile.
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-stone-500">Loading…</p>}>
        <SignUpForm />
      </Suspense>
      <p className="text-center text-sm text-stone-600 dark:text-stone-400">
        Already have an account?{" "}
        <Link
          href="/auth/login"
          className="font-medium text-stone-900 underline dark:text-stone-100"
        >
          Sign in
        </Link>
      </p>
    </main>
  );
}
