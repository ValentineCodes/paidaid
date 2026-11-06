import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "../../../lib/supabase/server";
import { isSupabaseConfigured } from "../../../lib/supabase/env";
import { ProfileForm } from "./profile-form";

export default async function AccountPage() {
  if (!isSupabaseConfigured()) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-2xl font-semibold">Account</h1>
        <p className="mt-2 text-stone-600 dark:text-stone-400">
          Configure{" "}
          <code className="font-mono text-sm">NEXT_PUBLIC_SUPABASE_URL</code>{" "}
          and{" "}
          <code className="font-mono text-sm">
            NEXT_PUBLIC_SUPABASE_ANON_KEY
          </code>{" "}
          in <code className="font-mono text-sm">apps/web/.env.local</code>. See{" "}
          <code className="font-mono text-sm">apps/web/.env.example</code>.
        </p>
        <Link
          href="/"
          className="mt-4 inline-block text-sm font-medium underline"
        >
          Back to home
        </Link>
      </main>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login?next=/account");
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <p className="text-red-700 dark:text-red-300">{error.message}</p>
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-2xl font-semibold">Account</h1>
        <p className="mt-2 text-stone-600 dark:text-stone-400">
          Your profile row is missing. Ensure the database migration ran and
          sign-up included display name metadata.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-16">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Account</h1>
        <p className="mt-1 text-sm text-stone-500">Signed in as {user.email}</p>
      </div>
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-medium text-stone-900 dark:text-stone-100">
          Profile
        </h2>
        <ProfileForm profile={profile} />
      </section>
    </main>
  );
}
