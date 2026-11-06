import { Suspense } from "react";
import Link from "next/link";

import { LoginForm } from "./login-form";
import { isSupabaseConfigured } from "../../../../lib/supabase/env";

export default function LoginPage() {
  if (!isSupabaseConfigured()) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-6 py-16">
        <h1 className="text-3xl font-semibold tracking-tight">Sign in</h1>
        <p className="text-stone-600 dark:text-stone-400">
          Add Supabase keys to{" "}
          <code className="font-mono text-sm">apps/web/.env.local</code> (see{" "}
          <code className="font-mono text-sm">.env.example</code>) to enable
          sign-in.
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
        <h1 className="text-3xl font-semibold tracking-tight">Sign in</h1>
        <p className="text-stone-600 dark:text-stone-400">
          Use your email and password. NEAR wallet is only needed on the
          Contract demo page.
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-stone-500">Loading…</p>}>
        <LoginForm />
      </Suspense>
      <p className="text-center text-sm text-stone-600 dark:text-stone-400">
        No account?{" "}
        <Link
          href="/auth/sign-up"
          className="font-medium text-stone-900 underline dark:text-stone-100"
        >
          Sign up
        </Link>
      </p>
    </main>
  );
}
