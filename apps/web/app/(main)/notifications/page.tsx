import Link from "next/link";
import { connection } from "next/server";
import { redirect } from "next/navigation";

import { createClient } from "../../../lib/supabase/server";
import { isSupabaseConfigured } from "../../../lib/supabase/env";

import {
  NotificationsInbox,
  type NotificationCategoryFilter,
} from "./notifications-inbox";

const PAGE_SIZE = 25;

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function parseCategory(raw: string | undefined): NotificationCategoryFilter {
  if (
    raw === "requests_responses" ||
    raw === "messages" ||
    raw === "payments_wallet" ||
    raw === "calls" ||
    raw === "tips_reminders"
  ) {
    return raw;
  }
  return "all";
}

export default async function NotificationsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const categoryParam =
    typeof sp.category === "string" ? sp.category : undefined;
  const pageParam =
    typeof sp.page === "string" ? parseInt(sp.page, 10) : undefined;

  const category = parseCategory(categoryParam);
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

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login?next=/notifications");
  }

  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let listQuery = supabase
    .from("notifications")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (category !== "all") {
    listQuery = listQuery.eq("category", category);
  }

  const [{ data: rows, error }, { count: unreadTotal }] = await Promise.all([
    listQuery,
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
        rows={list}
        unreadTotal={unreadTotal ?? 0}
        category={category}
        page={page}
        hasMore={hasMore}
      />

      <p className="mt-8 text-center text-sm text-[var(--muted)]">
        <Link href="/" className="font-semibold text-[var(--ink)] underline">
          Back to discovery
        </Link>
      </p>
    </main>
  );
}
