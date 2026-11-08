"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { createClient } from "../../../lib/supabase/client";
import { notificationHref } from "../../../lib/notifications/notification-link";
import type { Database } from "../../../lib/database.types";

type NotificationRow = Database["public"]["Tables"]["notifications"]["Row"];
export type NotificationCategoryFilter =
  "all" | Database["public"]["Enums"]["notification_category"];

const FILTERS: {
  value: NotificationCategoryFilter;
  label: string;
  hint?: string;
}[] = [
  { value: "all", label: "All" },
  { value: "requests_responses", label: "Requests & responses" },
  { value: "messages", label: "Messages" },
  {
    value: "payments_wallet",
    label: "Payments & wallet",
    hint: "No V1 notifications yet",
  },
  { value: "calls", label: "Calls", hint: "No V1 notifications yet" },
  {
    value: "tips_reminders",
    label: "Tips & reminders",
    hint: "Issues & reviews",
  },
];

function categoryLabel(
  c: Database["public"]["Enums"]["notification_category"],
): string {
  const m: Record<
    Database["public"]["Enums"]["notification_category"],
    string
  > = {
    requests_responses: "Requests & responses",
    messages: "Messages",
    payments_wallet: "Payments & wallet",
    calls: "Calls",
    tips_reminders: "Tips & reminders",
  };
  return m[c] ?? c;
}

type Props = {
  userId: string;
  rows: NotificationRow[];
  unreadTotal: number;
  category: NotificationCategoryFilter;
  page: number;
  hasMore: boolean;
};

export function NotificationsInbox({
  userId,
  rows,
  unreadTotal,
  category,
  page,
  hasMore,
}: Props) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);

  useEffect(() => {
    const ch = supabase
      .channel(`notifications-user:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        () => router.refresh(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [supabase, userId, router]);

  async function markRead(id: string) {
    setBusyId(id);
    setError(null);
    const { error: rpcErr } = await supabase.rpc("mark_notification_read", {
      p_notification_id: id,
    });
    setBusyId(null);
    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }
    router.refresh();
  }

  async function markAllRead() {
    setMarkingAll(true);
    setError(null);
    const markArgs =
      category === "all"
        ? ({} as Record<string, never>)
        : {
            p_category:
              category as Database["public"]["Enums"]["notification_category"],
          };
    const { error: rpcErr } = await supabase.rpc(
      "mark_all_notifications_read",
      markArgs,
    );
    setMarkingAll(false);
    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }
    router.refresh();
  }

  function queryForFilter(c: NotificationCategoryFilter, p: number) {
    const params = new URLSearchParams();
    if (c !== "all") {
      params.set("category", c);
    }
    if (p > 1) {
      params.set("page", String(p));
    }
    const q = params.toString();
    return q ? `/notifications?${q}` : "/notifications";
  }

  const showEmpty = rows.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <p className="text-sm text-stone-500">
          {unreadTotal > 0 ? (
            <span className="font-medium text-stone-800 dark:text-stone-200">
              {unreadTotal} unread
            </span>
          ) : (
            "All caught up."
          )}
        </p>
        <button
          type="button"
          onClick={() => void markAllRead()}
          disabled={markingAll || unreadTotal === 0}
          className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-medium disabled:opacity-50 dark:border-stone-600"
        >
          {markingAll ? "Marking…" : "Mark all read (this filter)"}
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.value}
            href={queryForFilter(f.value, 1)}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              category === f.value
                ? "btn-ink border-stone-900"
                : "border-stone-300 text-stone-700 dark:border-stone-600 dark:text-stone-300"
            }`}
            title={f.hint}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      )}

      {showEmpty && (
        <p className="rounded-lg border border-stone-200 px-4 py-8 text-center text-stone-600 dark:border-stone-800 dark:text-stone-400">
          No notifications in this filter.
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {rows.map((n) => {
          const unread = n.read_at === null;
          const href = notificationHref(n);
          return (
            <li
              key={n.id}
              className={`rounded-lg border px-4 py-3 dark:border-stone-800 ${
                unread
                  ? "text-on-light-surface border-stone-400 bg-stone-50 dark:border-stone-600 dark:bg-stone-900/40"
                  : "border-stone-200"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-stone-900 dark:text-stone-100">
                    {unread && (
                      <span
                        className="mr-2 inline-block h-2 w-2 rounded-full bg-blue-600"
                        aria-hidden
                      />
                    )}
                    {n.title}
                  </p>
                  {n.body && (
                    <p className="mt-1 text-sm text-stone-700 dark:text-stone-300">
                      {n.body}
                    </p>
                  )}
                  <p className="mt-2 text-xs text-stone-500">
                    {new Date(n.created_at).toLocaleString()} ·{" "}
                    <span className="capitalize">
                      {String(n.kind).replace(/_/g, " ")}
                    </span>
                    {" · "}
                    {categoryLabel(n.category)}
                  </p>
                </div>
                <div className="flex flex-col gap-1 text-sm">
                  {href && (
                    <Link
                      href={href}
                      onClick={() => {
                        if (unread) {
                          void markRead(n.id);
                        }
                      }}
                      className="font-medium text-stone-900 underline dark:text-stone-100"
                    >
                      Open
                    </Link>
                  )}
                  {unread && (
                    <button
                      type="button"
                      disabled={busyId === n.id}
                      onClick={() => void markRead(n.id)}
                      className="text-left text-xs text-stone-600 underline dark:text-stone-400"
                    >
                      Mark read
                    </button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {(hasMore || page > 1) && (
        <div className="flex justify-center gap-4 text-sm">
          {page > 1 ? (
            <Link
              href={queryForFilter(category, page - 1)}
              className="underline"
            >
              Previous
            </Link>
          ) : (
            <span className="text-stone-400">Previous</span>
          )}
          <span className="text-stone-500">Page {page}</span>
          {hasMore ? (
            <Link
              href={queryForFilter(category, page + 1)}
              className="underline"
            >
              Next
            </Link>
          ) : (
            <span className="text-stone-400">Next</span>
          )}
        </div>
      )}
    </div>
  );
}
