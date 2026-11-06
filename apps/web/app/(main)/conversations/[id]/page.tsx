import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { createClient } from "../../../../lib/supabase/server";
import { isSupabaseConfigured } from "../../../../lib/supabase/env";
import { ConversationChat, type ChatMessagePayload } from "./conversation-chat";

type PageProps = { params: Promise<{ id: string }> };

export default async function ConversationPage({ params }: PageProps) {
  const { id } = await params;

  if (!isSupabaseConfigured()) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <p>Supabase is not configured.</p>
      </main>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/auth/login?next=/conversations/${id}`);
  }

  const { data: conv, error: cErr } = await supabase
    .from("conversations")
    .select("id, kind, request_id, response_id, engagement_id")
    .eq("id", id)
    .maybeSingle();

  if (cErr || !conv) {
    notFound();
  }

  const rpcRes = await supabase.rpc("is_conversation_participant", {
    p_conversation_id: id,
    p_user_id: user.id,
  });
  const allowed = rpcRes.data === true;
  if (!allowed) {
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
    if (providerUid && reqRow.requester_id === user.id) {
      peerId = providerUid;
    } else if (providerUid === user.id) {
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
      peerId = a.requester_id === user.id ? a.provider_user_id : a.requester_id;
    }
  }

  if (!peerId) {
    notFound();
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

  const { data: meProfile } = await supabase
    .from("profiles")
    .select("live_profile_photo_path, live_profile_photo_captured_at")
    .eq("id", user.id)
    .maybeSingle();

  const hasLivePhoto =
    meProfile?.live_profile_photo_path != null &&
    meProfile?.live_profile_photo_captured_at != null;

  const { data: msgRows } = await supabase
    .from("messages")
    .select(
      `
      *,
      message_attachments (*)
    `,
    )
    .eq("conversation_id", id)
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

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-6 py-8">
      <p className="text-sm text-stone-500">
        <Link href={backHref} className="underline">
          ← Back
        </Link>
      </p>
      <h1 className="text-2xl font-semibold tracking-tight">Conversation</h1>
      <ConversationChat
        conversationId={id}
        initialMessages={initialMessages}
        currentUserId={user.id}
        peerUserId={peerId}
        peerDisplayName={peerProfiles?.display_name ?? "Participant"}
        peerPhone={peerPhone}
        hasLivePhoto={hasLivePhoto}
        requestTitle={reqRow.title}
        requestLocationLabel={reqRow.location_label}
        requestLocationKind={reqRow.location_kind}
      />
    </main>
  );
}
