import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "../../../lib/supabase/server";
import { isSupabaseConfigured } from "../../../lib/supabase/env";

export default async function EngagementsListPage() {
  if (!isSupabaseConfigured()) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <p className="text-stone-600 dark:text-stone-400">
          Configure Supabase.
        </p>
      </main>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login?next=/engagements");
  }

  const { data: rows, error } = await supabase
    .from("assignments")
    .select(
      `
      created_at,
      requester_id,
      provider_user_id,
      requests ( title ),
      engagements ( id, status, scheduled_for_day )
    `,
    )
    .or(`requester_id.eq.${user.id},provider_user_id.eq.${user.id}`)
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <p className="text-sm text-red-700">{error.message}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Engagements</h1>
      <p className="text-sm text-stone-500">
        Active work with a matched provider or requester.
      </p>
      {!rows?.length ? (
        <p className="text-stone-600 dark:text-stone-400">None yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((r) => {
            const e = r.engagements as {
              id: string;
              status: string;
              scheduled_for_day: string;
            } | null;
            const req = r.requests as { title: string } | null;
            const role = r.requester_id === user.id ? "requester" : "provider";
            if (!e) {
              return null;
            }
            return (
              <li key={e.id}>
                <Link
                  href={`/engagements/${e.id}`}
                  className="flex flex-col rounded-lg border border-stone-200 px-4 py-3 hover:bg-stone-50 dark:border-stone-800 dark:hover:bg-stone-900/50"
                >
                  <span className="font-medium">
                    {req?.title ?? "Engagement"}
                  </span>
                  <span className="text-xs capitalize text-stone-500">
                    {role} · {e.status} · {e.scheduled_for_day}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
