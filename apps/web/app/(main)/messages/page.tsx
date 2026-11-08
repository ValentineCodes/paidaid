import { connection } from "next/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "../../../lib/supabase/server";
import { isSupabaseConfigured } from "../../../lib/supabase/env";
import { getRequestWallTimeMs } from "../../../lib/datetime/request-wall-time";
import { loadMessagesSidebarData } from "../../../lib/messages/load-messages-sidebar";

import { MessagesShell } from "./messages-shell";

export default async function MessagesPage() {
  if (!isSupabaseConfigured()) {
    return (
      <main className="inner-page">
        <div className="page-heading">
          <span>CONVERSATIONS</span>
          <h1>Messages</h1>
          <p>Configure Supabase to load your threads.</p>
        </div>
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
    redirect("/auth/wallet?next=/messages");
  }

  const sidebarRows = await loadMessagesSidebarData(supabase, user.id, nowMs);

  return (
    <main className="inner-page">
      <div className="page-heading">
        <span>CONVERSATIONS</span>
        <h1>Messages</h1>
        <p>Keep every task moving.</p>
      </div>

      <MessagesShell
        sidebarRows={sidebarRows}
        activeConversationId={null}
        nowMs={nowMs}
      >
        {sidebarRows.length === 0 ? (
          <div className="chat flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center p-8">
            <div className="empty max-w-md border-0 bg-transparent p-0">
              <h3>No conversations yet</h3>
              <p>
                When you message someone about a request, it will show up here.
              </p>
            </div>
          </div>
        ) : (
          <div className="chat flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
            <p className="text-[12px] text-[var(--muted)]">
              Select a conversation on the left
            </p>
            <Link
              href={`/conversations/${sidebarRows[0]!.id}`}
              className="text-button !pb-0 !text-[12px]"
            >
              Open latest
            </Link>
          </div>
        )}
      </MessagesShell>
    </main>
  );
}
