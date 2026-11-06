import type { createClient } from "../supabase/server";
import type { Database } from "../database.types";

type Client = Awaited<ReturnType<typeof createClient>>;
type ConvKind = Database["public"]["Enums"]["conversation_kind"];

function peerAvatarClass(peerId: string): "coral" | "blue" {
  let h = 0;
  for (let i = 0; i < peerId.length; i++) {
    h = (h * 31 + peerId.charCodeAt(i)) | 0;
  }
  return (h >>> 0) % 2 === 0 ? "coral" : "blue";
}

export type MessagesSidebarRow = {
  id: string;
  updatedAt: string;
  peerDisplayName: string;
  /** Initials for `.avatar` */
  peerInitials: string;
  avatarClass: "coral" | "blue";
  preview: string;
  requestTitle: string;
};

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase() || "?";
}

function previewFromMessage(body: string | null, max = 42): string {
  const t = (body ?? "").replace(/\s+/g, " ").trim();
  if (!t) {
    return "No messages yet";
  }
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

/** Short labels like Figma: `2m`, `1h`, `3d`. */
export function formatMessageSidebarTime(iso: string, nowMs: number): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return "—";
  }
  const diffMs = nowMs - d.getTime();
  const sec = Math.floor(diffMs / 1000);
  const min = Math.floor(sec / 60);
  const hr = Math.floor(min / 60);
  const day = Math.floor(hr / 24);
  if (sec < 60) {
    return "now";
  }
  if (min < 60) {
    return `${min}m`;
  }
  if (hr < 24) {
    return `${hr}h`;
  }
  if (day < 7) {
    return `${day}d`;
  }
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * Sidebar data for Figma `messages-shell` (conversation list + active thread).
 */
export async function loadMessagesSidebarData(
  supabase: Client,
  userId: string,
  nowMs: number,
): Promise<MessagesSidebarRow[]> {
  const { data: convs, error } = await supabase
    .from("conversations")
    .select(
      `
      id,
      updated_at,
      kind,
      request_id,
      response_id,
      engagement_id,
      requests ( id, title, requester_id )
    `,
    )
    .order("updated_at", { ascending: false });

  if (error || !convs?.length) {
    return [];
  }

  type Req = { id: string; title: string; requester_id: string } | null;
  const rows = convs.filter((c) => {
    const req = c.requests as Req;
    return Boolean(req?.title);
  }) as {
    id: string;
    updated_at: string;
    kind: ConvKind;
    request_id: string;
    response_id: string | null;
    engagement_id: string | null;
    requests: NonNullable<Req>;
  }[];

  const preAccept = rows.filter((r) => r.kind === "pre_accept" && r.response_id);
  const engRows = rows.filter((r) => r.kind === "engagement" && r.engagement_id);

  const peerByConv = new Map<string, string>();

  if (preAccept.length > 0) {
    const responseIds = preAccept.map((r) => r.response_id!);
    const { data: rrRows } = await supabase
      .from("request_responses")
      .select("id, request_id, provider_profiles ( user_id )")
      .in("id", responseIds);
    for (const r of preAccept) {
      const rr = rrRows?.find((x) => x.id === r.response_id);
      const pp = rr?.provider_profiles as { user_id: string } | null;
      const providerUid = pp?.user_id ?? null;
      const requesterId = r.requests.requester_id;
      if (!providerUid) {
        continue;
      }
      if (requesterId === userId) {
        peerByConv.set(r.id, providerUid);
      } else if (providerUid === userId) {
        peerByConv.set(r.id, requesterId);
      }
    }
  }

  if (engRows.length > 0) {
    const engIds = engRows.map((r) => r.engagement_id!);
    const { data: engagements } = await supabase
      .from("engagements")
      .select(
        "id, assignments ( requester_id, provider_user_id )",
      )
      .in("id", engIds);
    for (const r of engRows) {
      const eng = engagements?.find((e) => e.id === r.engagement_id);
      const a = eng?.assignments as {
        requester_id: string;
        provider_user_id: string;
      } | null;
      if (!a) {
        continue;
      }
      const peer =
        a.requester_id === userId ? a.provider_user_id : a.requester_id;
      if (peer) {
        peerByConv.set(r.id, peer);
      }
    }
  }

  const validRows = rows.filter((r) => peerByConv.has(r.id));
  if (validRows.length === 0) {
    return [];
  }

  const peerIds = [...new Set(validRows.map((r) => peerByConv.get(r.id)!))];
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name")
    .in("id", peerIds);

  const nameByPeer = new Map(
    (profiles ?? []).map((p) => [p.id, p.display_name] as const),
  );

  const convIds = validRows.map((r) => r.id);
  const { data: msgRows } = await supabase
    .from("messages")
    .select("conversation_id, body, created_at")
    .in("conversation_id", convIds)
    .order("created_at", { ascending: false });

  const lastBodyByConv = new Map<string, string | null>();
  for (const m of msgRows ?? []) {
    const cid = m.conversation_id as string;
    if (!lastBodyByConv.has(cid)) {
      lastBodyByConv.set(cid, m.body);
    }
  }

  return validRows.map((r) => {
    const peerId = peerByConv.get(r.id)!;
    const dn = nameByPeer.get(peerId)?.trim() || "Participant";
    return {
      id: r.id,
      updatedAt: r.updated_at,
      peerDisplayName: dn,
      peerInitials: initialsFromName(dn),
      avatarClass: peerAvatarClass(peerId),
      preview: previewFromMessage(lastBodyByConv.get(r.id) ?? null),
      requestTitle: r.requests.title,
    };
  });
}
