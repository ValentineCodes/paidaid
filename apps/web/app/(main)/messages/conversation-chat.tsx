"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { User } from "@supabase/supabase-js";

import { ChatMessageAttachments } from "../../../components/chat-message-attachments";
import { FigmaIcon } from "../../../components/figma-icons";
import { createClient } from "../../../lib/supabase/client";
import { CONVERSATION_ATTACHMENTS_BUCKET } from "../../../lib/constants/storage";
import {
  extensionForAttachmentMime,
  validateChatFiles,
} from "../../../lib/chat/allowed-attachment";
import type { Database } from "../../../lib/database.types";
import { fetchConversationMessages } from "../../../lib/messages/fetch-conversation-messages";
import type { ChatMessagePayload } from "../../../lib/messages/chat-types";
import { messageAttachmentCaption } from "../../../lib/messages/attachment-caption";

export type { ChatMessagePayload } from "../../../lib/messages/chat-types";

type MessageRow = Database["public"]["Tables"]["messages"]["Row"];
type AttachmentRow = Database["public"]["Tables"]["message_attachments"]["Row"];

type Props = {
  conversationId: string;
  initialMessages: ChatMessagePayload[];
  currentUserId: string;
  peerUserId: string;
  peerDisplayName: string;
  peerAvatarClass: "coral" | "blue";
  /** Figma subtitle: "{task} · Active" */
  chatSubtitle: string;
  /** Co-participant phone when visible */
  peerPhone: string | null;
  /** When nested in `messages-shell`, header is optional (detail route shows it). */
  hideChatHead?: boolean;
  /** Mobile back control to inbox (left of peer avatar in header). */
  backHref?: string;
};

function dedupeById(rows: ChatMessagePayload[]): ChatMessagePayload[] {
  const map = new Map<string, ChatMessagePayload>();
  for (const r of rows) {
    map.set(r.id, r);
  }
  return [...map.values()].sort(
    (a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
}

function initialsFromDisplayName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase() || "?";
}

function calendarDayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function formatDaySeparator(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return "—";
  }
  const now = new Date();
  const todayKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  const yKey = `${y.getFullYear()}-${y.getMonth()}-${y.getDate()}`;
  const key = calendarDayKey(iso);
  if (key === todayKey) {
    return "TODAY";
  }
  if (key === yKey) {
    return "YESTERDAY";
  }
  return d
    .toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })
    .toUpperCase();
}

function formatBubbleTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function locationMessageLabel(
  body: string | null,
  locationLabel: string | null,
): string {
  const fromLabel = locationLabel?.trim();
  if (fromLabel) {
    return fromLabel;
  }
  const fromBody = body?.trim();
  if (fromBody) {
    return fromBody;
  }
  return "Shared location";
}

export function ConversationChat({
  conversationId,
  initialMessages,
  currentUserId,
  peerUserId,
  peerDisplayName,
  peerAvatarClass,
  chatSubtitle,
  peerPhone,
  hideChatHead = false,
  backHref,
}: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [user, setUser] = useState<User | null>(null);
  const [messages, setMessages] = useState<ChatMessagePayload[]>(() =>
    dedupeById(initialMessages),
  );
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [readByPeer, setReadByPeer] = useState<Set<string>>(new Set());
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => setUser(data.user));
  }, [supabase]);

  const syncMessagesFromServer = useCallback(async () => {
    const rows = await fetchConversationMessages(supabase, conversationId);
    setMessages(dedupeById(rows));
  }, [supabase, conversationId]);

  useEffect(() => {
    setMessages(dedupeById(initialMessages));
  }, [conversationId, initialMessages]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") {
        void syncMessagesFromServer();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    const poll = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void syncMessagesFromServer();
      }
    }, 20_000);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.clearInterval(poll);
    };
  }, [syncMessagesFromServer]);

  const enrichIncomingRow = useCallback(
    async (row: MessageRow): Promise<ChatMessagePayload> => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", row.sender_id)
        .maybeSingle();
      const { data: attachments } = await supabase
        .from("message_attachments")
        .select("*")
        .eq("message_id", row.id);
      return {
        ...row,
        display_name: profile?.display_name ?? "User",
        message_attachments: (attachments ?? []) as AttachmentRow[],
      };
    },
    [supabase],
  );

  const loadReads = useCallback(async () => {
    const ids = messages
      .filter((m) => m.sender_id === currentUserId)
      .map((m) => m.id);
    if (ids.length === 0) {
      return;
    }
    const { data } = await supabase
      .from("message_reads")
      .select("message_id")
      .eq("user_id", peerUserId)
      .in("message_id", ids);
    setReadByPeer(new Set((data ?? []).map((r) => r.message_id)));
  }, [supabase, messages, currentUserId, peerUserId]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      void loadReads();
    }, 0);
    return () => window.clearTimeout(t);
  }, [loadReads]);

  const markRead = useCallback(async () => {
    const { error: rpcErr } = await supabase.rpc("mark_conversation_read", {
      p_conversation_id: conversationId,
    });
    if (rpcErr) {
      return;
    }
    void loadReads();
  }, [supabase, conversationId, loadReads]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      void markRead();
    }, 0);
    return () => window.clearTimeout(t);
  }, [messages.length, markRead]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") {
        void markRead();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [markRead]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  useEffect(() => {
    const ch = supabase
      .channel(`conv:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        async (payload) => {
          const row = payload.new as MessageRow;
          if (!row.id) {
            return;
          }
          const enriched = await enrichIncomingRow(row);
          setMessages((prev) => dedupeById([...prev, enriched]));
          void markRead();
          void syncMessagesFromServer();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "message_reads",
          filter: `user_id=eq.${peerUserId}`,
        },
        (payload) => {
          const row = payload.new as { message_id?: string; user_id?: string };
          if (row.message_id) {
            setReadByPeer((s) => new Set(s).add(row.message_id!));
          }
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          void syncMessagesFromServer();
        }
      });

    return () => {
      void supabase.removeChannel(ch);
    };
  }, [
    supabase,
    conversationId,
    markRead,
    peerUserId,
    enrichIncomingRow,
    syncMessagesFromServer,
  ]);

  async function sendText() {
    const t = text.trim();
    const pendingFiles = files;
    if (sending || (!t && pendingFiles.length === 0)) {
      return;
    }
    if (pendingFiles.length > 0) {
      const val = validateChatFiles(pendingFiles);
      if (!val.ok) {
        setError(val.error);
        return;
      }
    }
    setSending(true);
    setError(null);
    const { data: mid, error: rpcErr } = await supabase.rpc("send_message", {
      p_conversation_id: conversationId,
      p_kind: "text",
      p_body: t,
    } as never);
    if (rpcErr || !mid) {
      setError(rpcErr?.message ?? "Could not send");
      setSending(false);
      return;
    }
    setText("");
    let attachError: string | null = null;
    if (pendingFiles.length > 0) {
      setUploadProgress("Uploading attachments…");
      const paths: string[] = [];
      const mimeTypes: string[] = [];
      const byteSizes: number[] = [];
      for (const f of pendingFiles) {
        const ext = extensionForAttachmentMime(f.type);
        const path = `${currentUserId}/${conversationId}/${mid}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from(CONVERSATION_ATTACHMENTS_BUCKET)
          .upload(path, f, { contentType: f.type, upsert: false });
        if (upErr) {
          attachError = upErr.message;
          break;
        }
        paths.push(path);
        mimeTypes.push(f.type);
        byteSizes.push(f.size);
      }
      if (!attachError && paths.length > 0) {
        const { error: addErr } = await supabase.rpc(
          "add_message_attachments",
          {
            p_message_id: mid as string,
            p_paths: paths,
            p_mime_types: mimeTypes,
            p_byte_sizes: byteSizes,
          } as never,
        );
        if (addErr) {
          attachError = addErr.message;
        }
      }
      setUploadProgress(null);
    }
    if (attachError) {
      setError(
        `Message sent but attachment failed: ${attachError}. You can send files in a follow-up message.`,
      );
    }
    setFiles([]);
    setSending(false);
    void markRead();
    const { data: full } = await supabase
      .from("messages")
      .select("*")
      .eq("id", mid as string)
      .maybeSingle();
    if (full) {
      const enriched = await enrichIncomingRow(full as MessageRow);
      setMessages((prev) =>
        dedupeById([
          ...prev.filter((m) => m.id !== (mid as string)),
          enriched,
        ]),
      );
    } else {
      void syncMessagesFromServer();
    }
  }

  async function shareLocation() {
    if (!navigator.geolocation) {
      setError("Location is not available in this browser.");
      return;
    }
    setSending(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { error: rpcErr } = await supabase.rpc("send_message", {
          p_conversation_id: conversationId,
          p_kind: "location",
          p_location_lat: pos.coords.latitude,
          p_location_lng: pos.coords.longitude,
          p_location_label: "My location",
        } as never);
        setSending(false);
        if (rpcErr) {
          setError(rpcErr.message);
          return;
        }
        void markRead();
      },
      () => {
        setSending(false);
        setError("Could not read location. Allow permission and try again.");
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  const mapUrl = (lat: number, lng: number) =>
    `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`;

  const peerInitials = initialsFromDisplayName(peerDisplayName);

  return (
    <div className="chat flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden">
      {!hideChatHead ? (
        <div className="chat-head shrink-0">
          {backHref ? (
            <Link
              href={backHref}
              className="chat-head-back icon-button"
              aria-label="Back to messages"
            >
              <FigmaIcon name="chevronLeft" size={18} />
            </Link>
          ) : null}
          <div className={`avatar shrink-0 ${peerAvatarClass}`}>
            {peerInitials}
            <span />
          </div>
          <div className="chat-head-meta">
            <strong>{peerDisplayName}</strong>
            <span className="chat-head-line">{chatSubtitle}</span>
            {peerPhone ? (
              <span className="chat-head-line">
                <a href={`tel:${peerPhone}`}>Call</a>
              </span>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => void shareLocation()}
            disabled={sending || !user}
          >
            <FigmaIcon name="pin" size={17} /> Share location
          </button>
        </div>
      ) : null}

      <div className="chat-body min-h-0 flex-1 overflow-auto">
        {messages.length === 0 && (
          <p className="text-[12px] text-[var(--muted)]">
            No messages yet. Say hello.
          </p>
        )}
        {messages.map((m, i) => {
          const mine = m.sender_id === currentUserId;
          const prev = messages[i - 1];
          const showDay =
            i === 0 ||
            (prev && calendarDayKey(prev.created_at) !== calendarDayKey(m.created_at));
          const attachmentCount = m.message_attachments?.length ?? 0;
          const attachmentCaption =
            attachmentCount > 0 ? messageAttachmentCaption(m.body) : null;
          const showTextBody =
            m.kind === "text" && m.body?.trim() && attachmentCount === 0;
          return (
            <div key={m.id} className="flex flex-col gap-3">
              {showDay ? <div className="day">{formatDaySeparator(m.created_at)}</div> : null}
              <div
                className={`bubble ${mine ? "mine" : "theirs"}${attachmentCount > 0 ? " bubble--media" : ""}`}
              >
                {showTextBody ? (
                  <span className="chat-bubble-caption whitespace-pre-wrap">
                    {m.body}
                  </span>
                ) : null}
                {m.kind === "location" &&
                  m.location_lat != null &&
                  m.location_lng != null && (
                    <a
                      href={mapUrl(m.location_lat, m.location_lng)}
                      target="_blank"
                      rel="noreferrer"
                      className="bubble-location-map"
                    >
                      <span className="bubble-location-pin" aria-hidden>
                        <FigmaIcon name="pin" size={16} />
                      </span>
                      <span className="bubble-location-copy">
                        <span className="bubble-location-title">
                          {locationMessageLabel(m.body, m.location_label)}
                        </span>
                        <span className="bubble-location-hint">
                          Open in maps
                        </span>
                      </span>
                    </a>
                  )}
                {m.message_attachments && m.message_attachments.length > 0 ? (
                  <ChatMessageAttachments
                    attachments={m.message_attachments}
                    caption={attachmentCaption}
                  />
                ) : null}
                <time
                  dateTime={m.created_at}
                  className="inline-flex items-center gap-1"
                >
                  {formatBubbleTime(m.created_at)}
                  {mine && readByPeer.has(m.id) ? (
                    <>
                      <FigmaIcon
                        name="checks"
                        size={12}
                        className="shrink-0 opacity-80"
                      />
                      <span className="sr-only">Read</span>
                    </>
                  ) : null}
                </time>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="chat-input shrink-0">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          hidden
          accept=".jpg,.jpeg,.png,.webp,.gif,.mp4,.webm,.pdf,.txt,.doc,.docx,image/*,video/mp4,video/webm,application/pdf,text/plain"
          onChange={(e) => {
            const list = e.target.files ? [...e.target.files] : [];
            setFiles(list.slice(0, 10));
            e.target.value = "";
          }}
        />
        <button
          type="button"
          className="attach-trigger icon-button shrink-0"
          aria-label="Attach files"
          disabled={!user}
          onClick={() => fileInputRef.current?.click()}
        >
          <FigmaIcon name="attach" size={18} />
        </button>
        <input
          type="text"
          className="chat-input-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={8000}
          placeholder="Write a message..."
          autoComplete="off"
          enterKeyHint="send"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void sendText();
            }
          }}
        />
        <button
          type="button"
          className="send"
          disabled={sending || !user}
          aria-label="Send message"
          onClick={() => void sendText()}
        >
          <FigmaIcon name="send" size={18} />
        </button>
      </div>

      {error ? (
        <p className="border-t border-[var(--line)] px-4 py-2 text-[11px] text-red-700 dark:text-red-300">
          {error}
        </p>
      ) : null}
      {uploadProgress ? (
        <p className="border-t border-[var(--line)] px-4 py-2 text-[11px] text-[var(--muted)]">
          {uploadProgress}
        </p>
      ) : null}
      {files.length > 0 ? (
        <p className="border-t border-[var(--line)] px-4 py-2 text-[10px] text-[var(--muted)]">
          {files.length} file{files.length === 1 ? "" : "s"} ready to send
        </p>
      ) : null}
    </div>
  );
}

