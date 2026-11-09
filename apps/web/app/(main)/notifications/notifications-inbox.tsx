"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { FigmaIcon, type FigmaIconName } from "../../../components/figma-icons";
import { createClient } from "../../../lib/supabase/client";
import { formatPostedRelative } from "../../../lib/datetime/relative-from-now";
import { notificationHref } from "../../../lib/notifications/notification-link";
import type { Database } from "../../../lib/database.types";

type NotificationRow = Database["public"]["Tables"]["notifications"]["Row"];

function iconForNotificationKind(
  kind: Database["public"]["Enums"]["notification_kind"],
): FigmaIconName {
  switch (kind) {
    case "new_message":
      return "message";
    case "request_new_response":
    case "response_withdrawn":
    case "response_accepted":
    case "response_rejected":
    case "engagement_created":
    case "settlement_eligible":
    case "settlement_released":
    case "settlement_auto_eligible":
      return "briefcase";
    case "delivery_submitted":
    case "delivery_revision_requested":
    case "delivery_approved":
    case "engagement_auto_completed":
      return "check";
    case "review_received":
      return "star";
    case "engagement_issue_reported":
    case "engagement_issue_resolved":
      return "clock";
    default:
      return "bell";
  }
}

type Props = {
  userId: string;
  nowMs: number;
  rows: NotificationRow[];
  unreadTotal: number;
  page: number;
  hasMore: boolean;
};

export function NotificationsInbox({
  userId,
  nowMs,
  rows,
  unreadTotal,
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
    const { error: rpcErr } = await supabase.rpc(
      "mark_all_notifications_read",
      {} as never,
    );
    setMarkingAll(false);
    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }
    router.refresh();
  }

  function pageHref(p: number) {
    return p > 1 ? `/notifications?page=${p}` : "/notifications";
  }

  return (
    <>
      <div className="updates-toolbar">
        <p className="updates-status">
          {unreadTotal > 0 ? (
            <>
              <strong>{unreadTotal}</strong> unread
            </>
          ) : (
            "All caught up."
          )}
        </p>
        <button
          type="button"
          onClick={() => void markAllRead()}
          disabled={markingAll || unreadTotal === 0}
          className="text-button"
        >
          {markingAll ? "Marking…" : "Mark all read"}
        </button>
      </div>

      {error ? <p className="updates-error">{error}</p> : null}

      <div className="updates-list">
        {rows.length === 0 ? (
          <div className="empty border-0 bg-transparent p-10">
            <h3>No updates yet</h3>
            <p>Responses, messages, and progress will show up here.</p>
          </div>
        ) : (
          rows.map((n) => {
            const unread = n.read_at === null;
            const href = notificationHref(n);
            const rowClass = `update${unread ? " new" : ""}`;
            const timeLabel = formatPostedRelative(
              new Date(n.created_at),
              nowMs,
            );
            const body = (
              <>
                <span className="update-icon" aria-hidden>
                  <FigmaIcon
                    name={iconForNotificationKind(n.kind)}
                    size={18}
                  />
                </span>
                <div>
                  <strong>{n.title}</strong>
                  {n.body ? <p>{n.body}</p> : null}
                </div>
                <time dateTime={n.created_at}>{timeLabel}</time>
                {unread ? <i aria-hidden /> : null}
              </>
            );

            if (href) {
              return (
                <Link
                  key={n.id}
                  href={href}
                  className={rowClass}
                  onClick={() => {
                    if (unread) {
                      void markRead(n.id);
                    }
                  }}
                  aria-busy={busyId === n.id}
                >
                  {body}
                </Link>
              );
            }

            return (
              <button
                key={n.id}
                type="button"
                className={rowClass}
                disabled={busyId === n.id}
                onClick={() => {
                  if (unread) {
                    void markRead(n.id);
                  }
                }}
              >
                {body}
              </button>
            );
          })
        )}
      </div>

      {(hasMore || page > 1) && (
        <nav className="updates-pagination" aria-label="Updates pages">
          {page > 1 ? (
            <Link href={pageHref(page - 1)}>Previous</Link>
          ) : (
            <span className="muted">Previous</span>
          )}
          <span className="muted">Page {page}</span>
          {hasMore ? (
            <Link href={pageHref(page + 1)}>Next</Link>
          ) : (
            <span className="muted">Next</span>
          )}
        </nav>
      )}
    </>
  );
}
