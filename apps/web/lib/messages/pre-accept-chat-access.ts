import type { createClient } from "../supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

/** True once the requester has sent any message in this conversation (pre-accept or engagement). */
export async function conversationInitializedByRequester(
  supabase: Client,
  conversationId: string,
  requesterId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("messages")
    .select("id")
    .eq("conversation_id", conversationId)
    .eq("sender_id", requesterId)
    .limit(1)
    .maybeSingle();
  return Boolean(data?.id);
}

export async function conversationHasUnreadFromSender(
  supabase: Client,
  conversationId: string,
  viewerId: string,
  senderId: string,
): Promise<boolean> {
  const { data: msgs } = await supabase
    .from("messages")
    .select("id")
    .eq("conversation_id", conversationId)
    .eq("sender_id", senderId);
  if (!msgs?.length) {
    return false;
  }
  const ids = msgs.map((m) => m.id);
  const { data: reads } = await supabase
    .from("message_reads")
    .select("message_id")
    .eq("user_id", viewerId)
    .in("message_id", ids);
  const read = new Set((reads ?? []).map((r) => r.message_id));
  return ids.some((id) => !read.has(id));
}

export async function resolvePreAcceptChatForViewer(
  supabase: Client,
  input: {
    conversationId: string;
    viewerId: string;
    requesterId: string;
    providerUserId: string;
  },
): Promise<{ showChatLink: boolean; hasUnread: boolean }> {
  const { conversationId, viewerId, requesterId, providerUserId } = input;
  const isRequester = viewerId === requesterId;
  const isProvider = viewerId === providerUserId;
  if (!isRequester && !isProvider) {
    return { showChatLink: false, hasUnread: false };
  }

  const requesterMessaged = await conversationInitializedByRequester(
    supabase,
    conversationId,
    requesterId,
  );

  const showChatLink = isRequester || (isProvider && requesterMessaged);
  if (!showChatLink) {
    return { showChatLink: false, hasUnread: false };
  }

  const peerId = isRequester ? providerUserId : requesterId;
  const hasUnread = await conversationHasUnreadFromSender(
    supabase,
    conversationId,
    viewerId,
    peerId,
  );
  return { showChatLink, hasUnread };
}
