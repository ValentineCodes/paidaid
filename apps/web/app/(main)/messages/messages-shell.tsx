import type { ReactNode } from "react";

import type { MessagesSidebarRow } from "../../../lib/messages/load-messages-sidebar";

import { MessagesSidebar } from "./messages-sidebar";

type Props = {
  sidebarRows: MessagesSidebarRow[];
  activeConversationId: string | null;
  nowMs: number;
  children: ReactNode;
};

/**
 * Figma `messages-shell`: conversation list + main chat area.
 */
export function MessagesShell({
  sidebarRows,
  activeConversationId,
  nowMs,
  children,
}: Props) {
  return (
    <div className="messages-shell">
      <MessagesSidebar
        rows={sidebarRows}
        activeConversationId={activeConversationId}
        nowMs={nowMs}
      />
      {children}
    </div>
  );
}
