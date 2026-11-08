import { connection } from "next/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "../../../../lib/supabase/server";
import { isSupabaseConfigured } from "../../../../lib/supabase/env";
import { WalletSignInForm } from "./wallet-sign-in-form";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function safeNextPath(raw: string | undefined): string {
  const next = raw?.trim() || "/";
  if (next.startsWith("/") && !next.startsWith("//")) {
    return next;
  }
  return "/";
}

export default async function WalletSignInPage({ searchParams }: PageProps) {
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
  const sp = await searchParams;
  const nextPath = safeNextPath(
    typeof sp.next === "string" ? sp.next : undefined,
  );

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect(nextPath);
  }

  return (
    <main className="inner-page">
      <WalletSignInForm nextPath={nextPath} />
    </main>
  );
}
