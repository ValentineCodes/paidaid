"use client";

import Link from "next/link";

import type { MessagesSidebarRow } from "../../../lib/messages/load-messages-sidebar";
import { formatMessageSidebarTime } from "../../../lib/messages/load-messages-sidebar";

type Props = {
  rows: MessagesSidebarRow[];
  activeConversationId: string | null;
  nowMs: number;
};

export function MessagesSidebar({ rows, activeConversationId, nowMs }: Props) {
  if (rows.length === 0) {
    return (
      <div className="conversation-list">
        <p className="px-3 py-8 text-center text-[11px] text-[var(--muted)]">
          No conversations yet
        </p>
      </div>
    );
  }

  return (
    <div className="conversation-list">
      {rows.map((r) => {
        const active = activeConversationId === r.id;
        return (
          <Link
            key={r.id}
            href={`/conversations/${r.id}`}
            className={`conversation${active ? " active" : ""}`}
          >
            <div className={`avatar ${r.avatarClass}`}>
              {r.peerInitials}
              {active ? <span /> : null}
            </div>
            <div>
              <strong>{r.peerDisplayName}</strong>
              <p>{r.preview}</p>
            </div>
            <time dateTime={r.updatedAt}>
              {formatMessageSidebarTime(r.updatedAt, nowMs)}
            </time>
          </Link>
        );
      })}
    </div>
  );
}
