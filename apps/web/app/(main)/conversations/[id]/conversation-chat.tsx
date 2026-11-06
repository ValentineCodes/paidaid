"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { User } from "@supabase/supabase-js";

import { createClient } from "../../../../lib/supabase/client";
import { CONVERSATION_ATTACHMENTS_BUCKET } from "../../../../lib/constants/storage";
import {
  extensionForAttachmentMime,
  validateChatFiles,
} from "../../../../lib/chat/allowed-attachment";
import type { Database } from "../../../../lib/database.types";

type MessageRow = Database["public"]["Tables"]["messages"]["Row"];
type AttachmentRow = Database["public"]["Tables"]["message_attachments"]["Row"];

export type ChatMessagePayload = MessageRow & {
  display_name: string | null;
  message_attachments: AttachmentRow[] | null;
};

type Props = {
  conversationId: string;
  initialMessages: ChatMessagePayload[];
  currentUserId: string;
  peerUserId: string;
  peerDisplayName: string;
  /** Co-participant phone when visible */
  peerPhone: string | null;
  hasLivePhoto: boolean;
  requestTitle: string;
  requestLocationLabel: string | null;
  requestLocationKind: Database["public"]["Enums"]["location_kind"];
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

export function ConversationChat({
  conversationId,
  initialMessages,
  currentUserId,
  peerUserId,
  peerDisplayName,
  peerPhone,
  hasLivePhoto,
  requestTitle,
  requestLocationLabel,
  requestLocationKind,
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
    if (!hasLivePhoto) {
      setError("Add a live profile photo in Account before messaging.");
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
    if (!hasLivePhoto) {
      setError("Add a live profile photo in Account before messaging.");
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

  return (
    <div className="flex min-h-[420px] flex-col rounded-xl border border-stone-200 bg-white dark:border-stone-700 dark:bg-stone-950">
      <div className="border-b border-stone-200 px-4 py-3 dark:border-stone-700">
        <p className="text-sm font-medium text-stone-900 dark:text-stone-100">
          {requestTitle}
        </p>
        <p className="text-xs text-stone-500">
          With {peerDisplayName}
          {peerPhone ? (
            <>
              {" · "}
              <a href={`tel:${peerPhone}`} className="underline">
                Call
              </a>
            </>
          ) : null}
        </p>
        {requestLocationKind === "in_person" && requestLocationLabel ? (
          <p className="mt-1 text-xs text-stone-600 dark:text-stone-400">
            Task area: {requestLocationLabel}
            {" · "}
            <a
              href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(requestLocationLabel)}`}
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              Map search
            </a>
          </p>
        ) : null}
      </div>

      <div className="flex max-h-[min(60vh,480px)] flex-1 flex-col gap-2 overflow-y-auto px-4 py-3">
        {messages.length === 0 && (
          <p className="text-sm text-stone-500">No messages yet. Say hello.</p>
        )}
        {messages.map((m) => {
          const mine = m.sender_id === currentUserId;
          return (
            <div
              key={m.id}
              className={`flex flex-col gap-1 ${mine ? "items-end" : "items-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                  mine
                    ? "bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900"
                    : "bg-stone-100 text-stone-900 dark:bg-stone-800 dark:text-stone-100"
                }`}
              >
                {!mine && (
                  <p className="mb-1 text-xs opacity-80">{m.display_name}</p>
                )}
                {m.kind === "text" && (
                  <p className="whitespace-pre-wrap">{m.body}</p>
                )}
                {m.kind === "location" &&
                  m.location_lat != null &&
                  m.location_lng != null && (
                    <div>
                      <p>{m.body}</p>
                      <a
                        href={mapUrl(m.location_lat, m.location_lng)}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-block text-xs underline"
                      >
                        Open map
                      </a>
                    </div>
                  )}
                {m.message_attachments && m.message_attachments.length > 0 && (
                  <ul className="mt-2 space-y-1 text-xs">
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
              </div>
              <p className="text-[10px] text-stone-400">
                {new Date(m.created_at).toLocaleString()}
                {mine && readByPeer.has(m.id) ? " · Read" : ""}
              </p>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-stone-200 p-4 dark:border-stone-700">
        {!hasLivePhoto && (
          <p className="mb-2 text-sm text-amber-800 dark:text-amber-200">
            Complete the live profile photo requirement in Account to send
            messages.
          </p>
        )}
        {error && (
          <p className="mb-2 text-sm text-red-700 dark:text-red-300">{error}</p>
        )}
        {uploadProgress && (
          <p className="mb-2 text-sm text-stone-600">{uploadProgress}</p>
        )}
        <div className="flex flex-wrap gap-2">
          <input
            type="file"
            multiple
            accept=".jpg,.jpeg,.png,.webp,.gif,.mp4,.webm,.pdf,.txt,.doc,.docx,image/*,video/mp4,video/webm,application/pdf,text/plain"
            className="max-w-full text-sm"
            onChange={(e) => {
              const list = e.target.files ? [...e.target.files] : [];
              setFiles(list.slice(0, 10));
            }}
          />
          <button
            type="button"
            onClick={() => void shareLocation()}
            disabled={sending || !user || !hasLivePhoto}
            className="rounded-lg border border-stone-400 px-3 py-2 text-sm text-stone-800 disabled:opacity-60 dark:border-stone-500 dark:text-stone-200"
          >
            Share location
          </button>
        </div>
        <div className="mt-2 flex gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            maxLength={8000}
            placeholder="Message…"
            className="min-h-[44px] flex-1 resize-y rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100"
          />
          <button
            type="button"
            disabled={sending || !user || !hasLivePhoto}
            onClick={() => void sendText()}
            className="self-end rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-stone-100 dark:text-stone-900"
          >
            {sending ? "Sending…" : "Send"}
          </button>
        </div>
      </div>
    </div>
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
