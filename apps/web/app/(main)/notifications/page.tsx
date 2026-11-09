import { connection } from "next/server";
import { redirect } from "next/navigation";

import { createClient } from "../../../lib/supabase/server";
import { isSupabaseConfigured } from "../../../lib/supabase/env";
import { getRequestWallTimeMs } from "../../../lib/datetime/request-wall-time";

import { NotificationsInbox } from "./notifications-inbox";

const PAGE_SIZE = 25;

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function NotificationsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const pageParam =
    typeof sp.page === "string" ? parseInt(sp.page, 10) : undefined;

  const page =
    Number.isFinite(pageParam) && (pageParam as number) > 0
      ? (pageParam as number)
      : 1;

  if (!isSupabaseConfigured()) {
    return (
      <main className="inner-page">
        <div className="page-heading">
          <span>STAY IN THE LOOP</span>
          <h1>Updates</h1>
          <p>Configure Supabase to load updates.</p>
        </div>
        <p className="text-sm text-[var(--muted)]">
          Set{" "}
          <code className="font-mono text-[var(--ink)]">
            NEXT_PUBLIC_SUPABASE_URL
          </code>{" "}
          in <code className="font-mono">apps/web/.env.local</code>.
        </p>
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
    redirect("/auth/wallet?next=/notifications");
  }

  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const [{ data: rows, error }, { count: unreadTotal }] = await Promise.all([
    supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .range(from, to),
    supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .is("read_at", null),
  ]);

  if (error) {
    return (
      <main className="inner-page">
        <div className="page-heading">
          <span>STAY IN THE LOOP</span>
          <h1>Updates</h1>
          <p>Responses, messages, and progress in one place.</p>
        </div>
        <p className="text-sm text-red-700 dark:text-red-300">{error.message}</p>
      </main>
    );
  }

  const list = rows ?? [];
  const hasMore = list.length === PAGE_SIZE;

  return (
    <main className="inner-page">
      <div className="page-heading">
        <span>STAY IN THE LOOP</span>
        <h1>Updates</h1>
        <p>Responses, messages, and progress in one place.</p>
      </div>

      <NotificationsInbox
        userId={user.id}
        nowMs={nowMs}
        rows={list}
        unreadTotal={unreadTotal ?? 0}
        page={page}
        hasMore={hasMore}
      />
    </main>
  );
}
