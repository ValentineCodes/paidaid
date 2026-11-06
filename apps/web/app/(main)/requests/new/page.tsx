import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "../../../../lib/supabase/server";
import { isSupabaseConfigured } from "../../../../lib/supabase/env";
import { RequestComposerForm } from "./request-composer-form";

export default async function NewRequestPage() {
  if (!isSupabaseConfigured()) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-2xl font-semibold">New request</h1>
        <p className="mt-2 text-stone-600 dark:text-stone-400">
          Configure Supabase in{" "}
          <code className="font-mono text-sm">apps/web/.env.local</code> first.
        </p>
        <Link href="/" className="mt-4 inline-block text-sm underline">
          Home
        </Link>
      </main>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login?next=/requests/new");
  }

  const [
    { data: assets, error: assetsError },
    { data: tags, error: tagsError },
  ] = await Promise.all([
    supabase.from("assets").select("*").order("canonical_asset_key"),
    supabase.from("tags").select("*").order("category").order("sort_order"),
  ]);

  if (assetsError || tagsError || !assets?.length || !tags?.length) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-2xl font-semibold">New request</h1>
        <p className="mt-2 text-red-700 dark:text-red-300">
          {assetsError?.message ??
            tagsError?.message ??
            "Could not load catalogue data. Apply the Phase 2 migration and refresh."}
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-12">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">New request</h1>
        <p className="mt-1 text-sm text-stone-500">
          Step through each section, then publish or save as a draft.
        </p>
      </div>
      <RequestComposerForm
        assets={assets}
        tags={tags}
        defaultAssetId={assets[0].id}
      />
    </main>
  );
}
