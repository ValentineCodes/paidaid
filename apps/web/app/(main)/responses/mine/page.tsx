import Link from "next/link";
import { redirect } from "next/navigation";

import { WithdrawResponseForm } from "../../requests/[id]/withdraw-response-form";
import { createClient } from "../../../../lib/supabase/server";
import { isSupabaseConfigured } from "../../../../lib/supabase/env";
import {
  formatBudgetSmallestUnits,
  normalizeAssetDecimals,
} from "../../../../lib/requests/format-budget";

export default async function MyResponsesPage() {
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
    redirect("/auth/wallet?next=/responses/mine");
  }

  const { data: pp } = await supabase
    .from("provider_profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  const { data: responses, error } = pp
    ? await supabase
        .from("request_responses_api")
        .select(
          `
          id,
          status,
          created_at,
          message,
          proposed_amount,
          request_id,
          requests ( id, title, status ),
          assets!request_responses_proposed_asset_id_fkey ( symbol, decimals )
        `,
        )
        .eq("provider_profile_id", pp.id)
        .order("created_at", { ascending: false })
    : { data: [], error: null };

  if (error) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <p className="text-sm text-red-700 dark:text-red-300">
          {error.message}
        </p>
      </main>
    );
  }

  const rows = (responses ?? []).flatMap((r) => {
    if (
      !r.id ||
      !r.request_id ||
      !r.status ||
      !r.created_at ||
      r.proposed_amount == null ||
      r.proposed_amount === ""
    ) {
      return [];
    }
    return [
      {
        id: r.id,
        request_id: r.request_id,
        status: r.status,
        created_at: r.created_at,
        proposed_amount: r.proposed_amount,
        message: r.message,
        requests: r.requests,
        assets: r.assets,
      },
    ];
  });

  const acceptedIds = rows
    .filter((r) => r.status === "accepted")
    .map((r) => r.id);
  const { data: assignmentLinks } =
    acceptedIds.length > 0
      ? await supabase
          .from("assignments")
          .select("accepted_response_id, engagements ( id )")
          .in("accepted_response_id", acceptedIds)
      : { data: [] };

  const engagementByResponseId = new Map<string, string>();
  for (const a of assignmentLinks ?? []) {
    const rel = a as {
      accepted_response_id: string;
      engagements: { id: string } | null;
    };
    if (rel.engagements?.id) {
      engagementByResponseId.set(rel.accepted_response_id, rel.engagements.id);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-12">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">My responses</h1>
        <p className="mt-1 text-sm text-stone-500">
          Offers you have submitted to other people&apos;s requests.
        </p>
      </div>

      {rows.length === 0 && (
        <p className="rounded-lg border border-stone-200 px-4 py-8 text-center text-stone-600 dark:border-stone-800 dark:text-stone-400">
          You have not submitted any responses yet.{" "}
          <Link href="/" className="underline">
            Browse the marketplace
          </Link>
          .
        </p>
      )}

      <ul className="flex flex-col gap-3">
        {rows.map((r) => {
          const req = r.requests as {
            id: string;
            title: string;
            status: string;
          } | null;
          const asset = r.assets as {
            symbol: string;
            decimals: number;
          } | null;
          const decimals = normalizeAssetDecimals(asset?.decimals);
          const sym = asset?.symbol ?? "";
          const amount = formatBudgetSmallestUnits(r.proposed_amount, decimals);
          return (
            <li
              key={r.id}
              className="rounded-lg border border-stone-200 px-4 py-3 dark:border-stone-800"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <Link
                    href={`/requests/${r.request_id}`}
                    className="font-medium text-stone-900 underline dark:text-stone-100"
                  >
                    {req?.title ?? "Request"}
                  </Link>
                  <p className="text-xs capitalize text-stone-500">
                    {r.status.replace(/_/g, " ")} ·{" "}
                    {new Date(r.created_at).toLocaleString()}
                  </p>
                </div>
                <p className="font-mono text-sm">
                  {amount} {sym}
                </p>
              </div>
              {r.message && (
                <p className="mt-2 text-sm text-stone-700 dark:text-stone-300">
                  {r.message}
                </p>
              )}
              {r.status === "pending" && (
                <div className="mt-3">
                  <WithdrawResponseForm
                    responseId={r.id}
                    requestId={r.request_id}
                  />
                </div>
              )}
              {r.status === "accepted" && engagementByResponseId.has(r.id) && (
                <p className="mt-3">
                  <Link
                    href={`/engagements/${engagementByResponseId.get(r.id)}`}
                    className="text-sm font-medium underline"
                  >
                    Open engagement overview
                  </Link>
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </main>
  );
}
