import { connection } from "next/server";
import Link from "next/link";

import { createClient } from "../../../../lib/supabase/server";
import { isSupabaseConfigured } from "../../../../lib/supabase/env";
import { WalletSignInForm } from "./wallet-sign-in-form";

export default async function WalletSignInPage() {
  if (!isSupabaseConfigured()) {
    return (
      <main className="inner-page">
        <p className="text-sm text-[var(--muted)]">
          Configure Supabase to enable wallet sign-in.
        </p>
        <Link href="/" className="mt-4 inline-block text-sm font-bold underline">
          Back to home
        </Link>
      </main>
    );
  }

  await connection();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="inner-page">
      <WalletSignInForm alreadySignedIn={Boolean(user)} />
    </main>
  );
}
