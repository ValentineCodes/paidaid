import { connection } from "next/server";
import { redirect } from "next/navigation";

import { createClient } from "../../../../lib/supabase/server";
import { isSupabaseConfigured } from "../../../../lib/supabase/env";
import { getRequestWallTimeMs } from "../../../../lib/datetime/request-wall-time";
import { loadConversationThreadData } from "../../../../lib/messages/load-conversation-thread";
import { loadMessagesSidebarData } from "../../../../lib/messages/load-messages-sidebar";

import { ConversationChat } from "../conversation-chat";
import { MessagesShell } from "../messages-shell";

type PageProps = { params: Promise<{ id: string }> };

export default async function MessageThreadPage({ params }: PageProps) {
  const { id } = await params;

  if (!isSupabaseConfigured()) {
    return (
      <main className="inner-page">
        <p>Supabase is not configured.</p>
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
    redirect(`/auth/wallet?next=/messages/${id}`);
  }

  const thread = await loadConversationThreadData(supabase, user.id, id);

  const sidebarRows = await loadMessagesSidebarData(supabase, user.id, nowMs);

  return (
    <main className="inner-page inner-page--messages-thread">
      <div className="page-heading messages-page-heading">
        <span>CONVERSATIONS</span>
        <h1>Messages</h1>
        <p>Keep every task moving.</p>
      </div>

      <MessagesShell
        sidebarRows={sidebarRows}
        activeConversationId={id}
        nowMs={nowMs}
        layout="thread"
      >
        <ConversationChat
          backHref="/messages"
          conversationId={id}
          initialMessages={thread.initialMessages}
          currentUserId={user.id}
          peerUserId={thread.peerId}
          peerDisplayName={thread.peerDisplayName}
          peerAvatarClass={thread.peerAvatarClass}
          chatSubtitle={thread.chatSubtitle}
          peerPhone={thread.peerPhone}
          hideChatHead={false}
          providerAwaitingRequester={thread.providerAwaitingRequester}
        />
      </MessagesShell>
    </main>
  );
}
