import Link from "next/link";
import { connection } from "next/server";
import { redirect } from "next/navigation";

import { createClient } from "../../../lib/supabase/server";
import { isSupabaseConfigured } from "../../../lib/supabase/env";
import { getRequestWallTimeMs } from "../../../lib/datetime/request-wall-time";
import { resolveProfileDisplayUrl } from "../../../lib/profiles/resolve-photo";
import { loadActiveLinkedNearWallet } from "../../../lib/near/load-linked-wallet";
import { NearWalletSectionLoader } from "./near-wallet-section-loader";
import { ProfileShell } from "./profile-shell";

export default async function AccountPage() {
  if (!isSupabaseConfigured()) {
    return (
      <main className="inner-page">
        <div className="page-heading">
          <span>YOUR IDENTITY</span>
          <h1>Profile</h1>
          <p>Configure Supabase to load your account.</p>
        </div>
        <p className="text-sm text-[var(--muted)]">
          Set{" "}
          <code className="font-mono text-[var(--ink)]">
            NEXT_PUBLIC_SUPABASE_URL
          </code>{" "}
          and{" "}
          <code className="font-mono text-[var(--ink)]">
            NEXT_PUBLIC_SUPABASE_ANON_KEY
          </code>{" "}
          in <code className="font-mono text-[var(--ink)]">apps/web/.env.local</code>.
        </p>
        <Link href="/" className="mt-6 inline-block text-sm font-bold underline">
          Back to home
        </Link>
      </main>
    );
  }

  await connection();
  const nowMs = getRequestWallTimeMs();

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
      <main className="inner-page">
        <p className="text-red-700">{error.message}</p>
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="inner-page">
        <div className="page-heading">
          <span>YOUR IDENTITY</span>
          <h1>Profile</h1>
          <p>Your profile row is missing. Run migrations and sign up again.</p>
        </div>
      </main>
    );
  }

  const { data: reviewRows } = await supabase
    .from("reviews")
    .select("id, rating, comment, created_at, requester_id")
    .eq("provider_user_id", user.id)
    .order("created_at", { ascending: false });

  const reviews = reviewRows ?? [];
  const reviewCount = reviews.length;
  const avgRating =
    reviewCount > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviewCount
      : null;

  const requesterIds = [...new Set(reviews.map((r) => r.requester_id))];
  const requesterNames = new Map<string, string>();
  if (requesterIds.length > 0) {
    const { data: nameRows } = await supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", requesterIds);
    for (const row of nameRows ?? []) {
      requesterNames.set(row.id, row.display_name);
    }
  }

  const { count: assignmentCount } = await supabase
    .from("assignments")
    .select("*", { count: "exact", head: true })
    .or(`requester_id.eq.${user.id},provider_user_id.eq.${user.id}`);

  const taskCount = assignmentCount ?? 0;

  const photoDisplayUrl = await resolveProfileDisplayUrl(supabase, profile);
  const linkedWallet = await loadActiveLinkedNearWallet(supabase, user.id);

  return (
    <>
    <ProfileShell
      nowMs={nowMs}
      profile={profile}
      photoDisplayUrl={photoDisplayUrl}
      userEmail={user.email ?? ""}
      reviews={reviews.slice(0, 10)}
      requesterNames={requesterNames}
      avgRating={avgRating}
      reviewCount={reviewCount}
      taskCount={taskCount}
    />
    <NearWalletSectionLoader linked={linkedWallet} />
    </>
  );
}
