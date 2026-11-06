import { notFound } from "next/navigation";

import type { createClient } from "../supabase/server";
import type { Database } from "../database.types";
import type { ChatMessagePayload } from "./chat-types";

type Client = Awaited<ReturnType<typeof createClient>>;

export type ConversationRequestRow = {
  id: string;
  title: string;
  location_kind: Database["public"]["Enums"]["location_kind"];
  location_label: string | null;
  timing_type: Database["public"]["Enums"]["timing_type"];
  scheduled_at: string | null;
  requester_id: string;
};

function avatarClassForPeer(peerId: string): "coral" | "blue" {
  let h = 0;
  for (let i = 0; i < peerId.length; i++) {
    h = (h * 31 + peerId.charCodeAt(i)) | 0;
  }
  return (h >>> 0) % 2 === 0 ? "coral" : "blue";
}

export type ConversationThreadData = {
  conv: {
    id: string;
    kind: Database["public"]["Enums"]["conversation_kind"];
    request_id: string;
    response_id: string | null;
    engagement_id: string | null;
  };
  peerId: string;
  peerDisplayName: string;
  peerAvatarClass: "coral" | "blue";
  peerPhone: string | null;
  backHref: string;
  /** Figma chat subline: `{title} · Active` etc. */
  chatSubtitle: string;
  reqRow: ConversationRequestRow;
  initialMessages: ChatMessagePayload[];
};

export async function loadConversationThreadData(
  supabase: Client,
  userId: string,
  conversationId: string,
): Promise<ConversationThreadData> {
  const { data: conv, error: cErr } = await supabase
    .from("conversations")
    .select("id, kind, request_id, response_id, engagement_id")
    .eq("id", conversationId)
    .maybeSingle();

  if (cErr || !conv) {
    notFound();
  }

  const rpcRes = await supabase.rpc("is_conversation_participant", {
    p_conversation_id: conversationId,
    p_user_id: userId,
  });
  if (rpcRes.data !== true) {
    notFound();
  }

  const { data: reqRow } = await supabase
    .from("requests")
    .select(
      "id, title, location_kind, location_label, timing_type, scheduled_at, requester_id",
    )
    .eq("id", conv.request_id)
    .maybeSingle();

  if (!reqRow) {
    notFound();
  }

  let peerId: string | null = null;
  if (conv.kind === "pre_accept" && conv.response_id) {
    const { data: rr } = await supabase
      .from("request_responses")
      .select("provider_profile_id, provider_profiles ( user_id )")
      .eq("id", conv.response_id)
      .maybeSingle();
    const pp = rr?.provider_profiles as { user_id: string } | null;
    const providerUid = pp?.user_id ?? null;
    if (providerUid && reqRow.requester_id === userId) {
      peerId = providerUid;
    } else if (providerUid === userId) {
      peerId = reqRow.requester_id;
    }
  } else if (conv.kind === "engagement" && conv.engagement_id) {
    const { data: eng } = await supabase
      .from("engagements")
      .select("assignment_id, assignments ( requester_id, provider_user_id )")
      .eq("id", conv.engagement_id)
      .maybeSingle();
    const a = eng?.assignments as {
      requester_id: string;
      provider_user_id: string;
    } | null;
    if (a) {
      peerId = a.requester_id === userId ? a.provider_user_id : a.requester_id;
    }
  }

  if (!peerId) {
    notFound();
  }

  let engagementStatus: Database["public"]["Enums"]["engagement_status"] | null =
    null;
  if (conv.kind === "engagement" && conv.engagement_id) {
    const { data: engStatus } = await supabase
      .from("engagements")
      .select("status")
      .eq("id", conv.engagement_id)
      .maybeSingle();
    engagementStatus = engStatus?.status ?? null;
  }

  const { data: peerProfiles } = await supabase
    .from("profiles")
    .select("id, display_name")
    .eq("id", peerId)
    .maybeSingle();

  let peerPhone: string | null = null;
  const { data: canRead } = await supabase.rpc("can_read_private_contact", {
    p_target_user: peerId,
  });
  if (canRead === true) {
    const { data: pc } = await supabase
      .from("profile_private_contact")
      .select("phone")
      .eq("user_id", peerId)
      .maybeSingle();
    peerPhone = pc?.phone ?? null;
  }

  const { data: msgRows } = await supabase
    .from("messages")
    .select(
      `
      *,
      message_attachments (*)
    `,
    )
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  const senderIds = [...new Set((msgRows ?? []).map((m) => m.sender_id))];
  const { data: nameRows } =
    senderIds.length > 0
      ? await supabase
          .from("profiles")
          .select("id, display_name")
          .in("id", senderIds)
      : { data: [] };

  const nameById = new Map(
    (nameRows ?? []).map((r) => [r.id, r.display_name] as const),
  );

  const initialMessages: ChatMessagePayload[] = (msgRows ?? []).map((m) => ({
    ...m,
    display_name: nameById.get(m.sender_id) ?? "User",
    message_attachments: (m.message_attachments ??
      []) as ChatMessagePayload["message_attachments"],
  }));

  const backHref =
    conv.kind === "engagement" && conv.engagement_id
      ? `/engagements/${conv.engagement_id}`
      : `/requests/${conv.request_id}`;

  const req = reqRow as ConversationRequestRow;
  const statusWord =
    engagementStatus === "active"
      ? "Active"
      : engagementStatus === "completed"
        ? "Completed"
        : null;
  const chatSubtitle =
    conv.kind === "engagement" && statusWord
      ? `${req.title} · ${statusWord}`
      : `${req.title} · Offer`;

  return {
    conv,
    peerId,
    peerDisplayName: peerProfiles?.display_name ?? "Participant",
    peerAvatarClass: avatarClassForPeer(peerId),
    peerPhone,
    backHref,
    chatSubtitle,
    reqRow: req,
    initialMessages,
  };
}
