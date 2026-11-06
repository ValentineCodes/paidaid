import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "../../../../lib/supabase/server";
import { isSupabaseConfigured } from "../../../../lib/supabase/env";
import { formatBudgetSmallestUnits } from "../../../../lib/requests/format-budget";

export default async function MyRequestsPage() {
  if (!isSupabaseConfigured()) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <p className="text-stone-600 dark:text-stone-400">
          Configure Supabase in{" "}
          <code className="font-mono text-sm">.env.local</code>.
        </p>
      </main>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login?next=/requests/mine");
  }

  const { data: requests, error } = await supabase
    .from("requests")
    .select("id, title, status, published_at, budget_amount, budget_asset_id")
    .eq("requester_id", user.id)
    .order("updated_at", { ascending: false });

  const assetIds = [
    ...new Set(
      (requests ?? [])
        .map((r) => r.budget_asset_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const { data: assetRows } =
    assetIds.length > 0
      ? await supabase
          .from("assets")
          .select("id, symbol, decimals")
          .in("id", assetIds)
      : { data: [] };

  const assetMap = new Map((assetRows ?? []).map((a) => [a.id, a] as const));

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-12">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">My requests</h1>
          <p className="mt-1 text-sm text-stone-500">
            Drafts stay private. Indicative budgets are not funded or escrowed.
          </p>
        </div>
        <Link
          href="/requests/new"
          className="rounded-lg bg-stone-900 px-3 py-2 text-sm font-medium text-white hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-200"
        >
          New request
        </Link>
      </div>

      {error && (
        <p className="text-sm text-red-700 dark:text-red-300">
          {error.message}
        </p>
      )}

      {!error && (!requests || requests.length === 0) && (
        <p className="rounded-lg border border-stone-200 px-4 py-8 text-center text-stone-600 dark:border-stone-800 dark:text-stone-400">
          You have not created any requests yet.
        </p>
      )}

      <ul className="flex flex-col gap-3">
        {requests?.map((r) => {
          const assets = assetMap.get(r.budget_asset_id);
          const budget =
            assets != null
              ? formatBudgetSmallestUnits(r.budget_amount, assets.decimals)
              : String(r.budget_amount);
          const sym = assets?.symbol ?? "";
          return (
            <li key={r.id}>
              <Link
                href={`/requests/${r.id}`}
                className="flex flex-col gap-1 rounded-lg border border-stone-200 px-4 py-3 transition hover:bg-stone-50 dark:border-stone-800 dark:hover:bg-stone-900/50 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium text-stone-900 dark:text-stone-100">
                    {r.title}
                  </p>
                  <p className="text-xs capitalize text-stone-500">
                    {r.status.replace(/_/g, " ")}
                    {r.published_at
                      ? ` · ${new Date(r.published_at).toLocaleString()}`
                      : ""}
                  </p>
                </div>
                <p className="font-mono text-sm text-stone-700 dark:text-stone-300">
                  {budget} {sym}
                  <span className="ml-1 text-xs font-sans text-stone-500">
                    (indicative)
                  </span>
                </p>
              </Link>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
