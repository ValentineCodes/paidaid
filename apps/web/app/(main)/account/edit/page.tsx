import Link from "next/link";
import { connection } from "next/server";
import { redirect } from "next/navigation";

import { createClient } from "../../../../lib/supabase/server";
import { isSupabaseConfigured } from "../../../../lib/supabase/env";
import { resolveProfileDisplayUrl } from "../../../../lib/profiles/resolve-photo";
import { ProfileForm } from "../profile-form";

export default async function EditProfilePage() {
  if (!isSupabaseConfigured()) {
    return (
      <main className="inner-page">
        <div className="page-heading">
          <span>SETTINGS</span>
          <h1>Edit profile</h1>
          <p>Configure Supabase to save changes.</p>
        </div>
        <Link href="/account" className="text-button">
          Back to profile
        </Link>
      </main>
    );
  }

  await connection();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/wallet?next=/account/edit");
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    return (
      <main className="inner-page">
        <p className="text-red-700">{error.message}</p>
      </main>
    );
  }

  if (!profile) {
    redirect("/account");
  }

  const photoDisplayUrl = await resolveProfileDisplayUrl(supabase, profile);

  return (
    <main className="inner-page">
      <div className="page-heading">
        <span>SETTINGS</span>
        <h1>Edit profile</h1>
        <p>Update how you show up across PaidAid.</p>
      </div>

      <div className="mb-8 max-w-[680px]">
        <Link href="/account" className="text-button">
          ← Back to profile
        </Link>
      </div>

      <div className="mx-auto max-w-[680px] rounded-[14px] border border-[var(--line)] bg-[var(--surface)] p-7">
        <ProfileForm profile={profile} photoDisplayUrl={photoDisplayUrl} />
      </div>

    </main>
  );
}
