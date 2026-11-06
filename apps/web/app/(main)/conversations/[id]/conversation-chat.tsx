"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { User } from "@supabase/supabase-js";

import { FigmaIcon } from "../../../../components/figma-icons";
import { createClient } from "../../../../lib/supabase/client";
import { CONVERSATION_ATTACHMENTS_BUCKET } from "../../../../lib/constants/storage";
import {
  extensionForAttachmentMime,
  validateChatFiles,
} from "../../../../lib/chat/allowed-attachment";
import type { Database } from "../../../../lib/database.types";
import type { ChatMessagePayload } from "../../../../lib/messages/chat-types";

export type { ChatMessagePayload } from "../../../../lib/messages/chat-types";

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
  hasProfilePhoto: boolean;
  requestLocationLabel: string | null;
  requestLocationKind: Database["public"]["Enums"]["location_kind"];
  /** When nested in `messages-shell`, header is optional (detail route shows it). */
  hideChatHead?: boolean;
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

export function ConversationChat({
  conversationId,
  initialMessages,
  currentUserId,
  peerUserId,
  peerDisplayName,
  peerAvatarClass,
  chatSubtitle,
  peerPhone,
  hasProfilePhoto,
  requestLocationLabel,
  requestLocationKind,
  hideChatHead = false,
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
          if (row.id) {
            const { data: full } = await supabase
              .from("messages")
              .select(
                `
                *,
                profiles!messages_sender_id_fkey ( display_name ),
                message_attachments (*)
              `,
              )
              .eq("id", row.id)
              .maybeSingle();
            if (full) {
              const typed = full as unknown as {
                display_name?: string;
                profiles?:
                  { display_name: string } | { display_name: string }[];
                message_attachments: AttachmentRow[] | null;
              };
              const dn = Array.isArray(typed.profiles)
                ? typed.profiles[0]?.display_name
                : typed.profiles?.display_name;
              setMessages((prev) =>
                dedupeById([
                  ...prev,
                  {
                    ...row,
                    display_name: dn ?? "User",
                    message_attachments: typed.message_attachments ?? [],
                  },
                ]),
              );
            }
          }
          void markRead();
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
      .subscribe();

    return () => {
      void supabase.removeChannel(ch);
    };
  }, [supabase, conversationId, markRead, peerUserId]);

  async function sendText() {
    const t = text.trim();
    if (!t || sending) {
      return;
    }
    if (!hasProfilePhoto) {
      setError("Add a profile photo in Account before messaging.");
      return;
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
    if (files.length > 0) {
      const val = validateChatFiles(files);
      if (!val.ok) {
        attachError = val.error;
      } else {
        setUploadProgress("Uploading attachments…");
        const paths: string[] = [];
        const mimeTypes: string[] = [];
        const byteSizes: number[] = [];
        for (const f of files) {
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
      .select(
        `
        *,
        profiles!messages_sender_id_fkey ( display_name ),
        message_attachments (*)
      `,
      )
      .eq("id", mid as string)
      .maybeSingle();
    if (full) {
      const typed = full as unknown as {
        profiles?: { display_name: string } | { display_name: string }[];
        message_attachments: AttachmentRow[] | null;
      };
      const dn = Array.isArray(typed.profiles)
        ? typed.profiles[0]?.display_name
        : typed.profiles?.display_name;
      setMessages((prev) =>
        dedupeById([
          ...prev.filter((m) => m.id !== (mid as string)),
          {
            ...(full as unknown as MessageRow),
            display_name: dn ?? "You",
            message_attachments: typed.message_attachments ?? [],
          },
        ]),
      );
    }
  }

  async function shareLocation() {
    if (!hasProfilePhoto) {
      setError("Add a profile photo in Account before messaging.");
      return;
    }
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
    <>
      {!hideChatHead ? (
        <div className="chat-head shrink-0">
          <div className={`avatar ${peerAvatarClass}`}>
            {peerInitials}
            <span />
          </div>
          <div>
            <strong>{peerDisplayName}</strong>
            <span>{chatSubtitle}</span>
            {peerPhone ? (
              <span>
                {" · "}
                <a href={`tel:${peerPhone}`}>Call</a>
              </span>
            ) : null}
            {requestLocationKind === "in_person" && requestLocationLabel ? (
              <span>
                {" · "}
                Task: {requestLocationLabel}
                {" · "}
                <a
                  href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(requestLocationLabel)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Map
                </a>
              </span>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => void shareLocation()}
            disabled={sending || !user || !hasProfilePhoto}
          >
            <FigmaIcon name="pin" size={17} /> Share location
          </button>
        </div>
      ) : null}

      <div className="chat-body flex min-h-0 flex-1 flex-col">
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
          return (
            <div key={m.id} className="flex flex-col gap-3">
              {showDay ? <div className="day">{formatDaySeparator(m.created_at)}</div> : null}
              <div
                className={`bubble ${mine ? "mine" : "theirs"}`}
              >
                {!mine ? (
                  <span className="mb-1 text-[10px] opacity-80">
                    {m.display_name}
                  </span>
                ) : null}
                {m.kind === "text" && (
                  <span className="whitespace-pre-wrap">{m.body}</span>
                )}
                {m.kind === "location" &&
                  m.location_lat != null &&
                  m.location_lng != null && (
                    <div>
                      <span>{m.body}</span>
                      <a
                        href={mapUrl(m.location_lat, m.location_lng)}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-block text-[10px] underline"
                      >
                        Open map
                      </a>
                    </div>
                  )}
                {m.message_attachments && m.message_attachments.length > 0 && (
                  <ul className="mt-2 space-y-1 text-[10px]">
                    {m.message_attachments.map((a) => (
                      <li key={a.id}>
                        <AttachmentLink
                          path={a.storage_path}
                          mime={a.mime_type}
                        />
                      </li>
                    ))}
                  </ul>
                )}
                <time dateTime={m.created_at}>
                  {formatBubbleTime(m.created_at)}
                  {mine && readByPeer.has(m.id) ? " · Read" : ""}
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
          disabled={!hasProfilePhoto}
          onClick={() => fileInputRef.current?.click()}
        >
          <FigmaIcon name="attach" size={18} />
        </button>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={8000}
          rows={1}
          placeholder="Write a message..."
          disabled={!hasProfilePhoto}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void sendText();
            }
          }}
        />
        <button
          type="button"
          className="send"
          disabled={sending || !user || !hasProfilePhoto}
          aria-label="Send message"
          onClick={() => void sendText()}
        >
          <FigmaIcon name="send" size={18} />
        </button>
      </div>

      {!hasProfilePhoto ? (
        <p className="border-t border-[var(--line)] px-4 py-2 text-[11px] text-amber-800 dark:text-amber-200">
          Add a profile photo in Account settings to send messages.
        </p>
      ) : null}
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
    </>
  );
}

function AttachmentLink({ path, mime }: { path: string; mime: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void supabase.storage
      .from(CONVERSATION_ATTACHMENTS_BUCKET)
      .createSignedUrl(path, 3600)
      .then(({ data }) => {
        if (!cancelled) {
          setUrl(data?.signedUrl ?? null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [supabase, path]);

  if (!url) {
    return <span className="text-stone-500">Loading… ({mime})</span>;
  }
  const isImg = mime.startsWith("image/");
  if (isImg) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt=""
          className="max-h-32 rounded border border-stone-200 dark:border-stone-600"
        />
      </a>
    );
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" className="underline">
      Download ({mime})
    </a>
  );
}
