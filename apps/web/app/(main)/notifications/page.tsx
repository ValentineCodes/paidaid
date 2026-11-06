import Link from "next/link";
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
      <main className="mx-auto max-w-3xl px-6 py-12">
        <p className="text-sm text-red-700 dark:text-red-300">
          {error.message}
        </p>
      </main>
    );
  }

  const list = rows ?? [];
  const hasMore = list.length === PAGE_SIZE;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-12">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Notifications</h1>
        <p className="mt-1 text-sm text-stone-500">
          In-app updates.{" "}
          <span className="text-stone-400">
            Payments, calls, and wallet alerts are not active in V1 — filters
            stay for later.
          </span>
        </p>
      </div>

      <NotificationsInbox
        userId={user.id}
        rows={list}
        unreadTotal={unreadTotal ?? 0}
        category={category}
        page={page}
        hasMore={hasMore}
      />

      <p className="text-center text-sm text-stone-500">
        <Link href="/" className="underline">
          Back to discovery
        </Link>
      </p>
    </main>
  );
}
