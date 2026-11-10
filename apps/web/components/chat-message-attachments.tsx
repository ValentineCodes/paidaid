"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { createClient } from "../lib/supabase/client";
import { CONVERSATION_ATTACHMENTS_BUCKET } from "../lib/constants/storage";

type Attachment = {
  id: string;
  storage_path: string;
  mime_type: string;
};

function useSignedUrls(paths: string[]) {
  const supabase = useMemo(() => createClient(), []);
  const pathsKey = paths.join("\0");
  const [urls, setUrls] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const next = new Map<string, string>();
      for (const path of paths) {
        const { data } = await supabase.storage
          .from(CONVERSATION_ATTACHMENTS_BUCKET)
          .createSignedUrl(path, 3600);
        if (cancelled) {
          return;
        }
        if (data?.signedUrl) {
          next.set(path, data.signedUrl);
        }
      }
      if (!cancelled) {
        setUrls(next);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, pathsKey]);

  return urls;
}

function ChatImageLightbox({
  imageUrls,
  onClose,
}: {
  imageUrls: string[];
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!mounted) {
    return null;
  }

  return createPortal(
    <div
      className="chat-image-lightbox"
      role="dialog"
      aria-modal
      aria-label="Image attachments"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <button
        type="button"
        className="chat-image-lightbox__close"
        onClick={onClose}
        aria-label="Close"
      >
        ×
      </button>
      <div className="chat-image-lightbox__scroll">
        {imageUrls.map((url) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={url} src={url} alt="" className="chat-image-lightbox__img" />
        ))}
      </div>
    </div>,
    document.body,
  );
}

export function ChatMessageAttachments({
  attachments,
  caption,
}: {
  attachments: Attachment[];
  caption?: string | null;
}) {
  const captionText = caption?.trim() ?? "";
  const images = attachments.filter((a) => a.mime_type.startsWith("image/"));
  const other = attachments.filter((a) => !a.mime_type.startsWith("image/"));
  const paths = images.map((a) => a.storage_path);
  const urls = useSignedUrls(paths);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const imageUrls = images
    .map((a) => urls.get(a.storage_path))
    .filter((u): u is string => Boolean(u));

  const coverPath = images[0]?.storage_path;
  const coverSigned = coverPath ? urls.get(coverPath) : undefined;
  const extraCount = images.length - 1;
  const [coverLoaded, setCoverLoaded] = useState(false);

  useEffect(() => {
    setCoverLoaded(false);
  }, [coverSigned]);

  const showCoverSkeleton = !coverSigned || !coverLoaded;

  return (
    <div className="chat-attachment-block">
      {images.length > 0 ? (
        <button
          type="button"
          className="chat-attachment-stack"
          onClick={() => setLightboxOpen(true)}
          disabled={imageUrls.length === 0}
          aria-busy={showCoverSkeleton}
          aria-label={
            images.length > 1
              ? `View ${images.length} images`
              : "View image attachment"
          }
        >
          <span className="chat-attachment-stack__frame">
            {showCoverSkeleton ? (
              <span
                className="chat-attachment-stack__skeleton"
                aria-hidden
              />
            ) : null}
            {coverSigned ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={coverSigned}
                alt=""
                className={
                  coverLoaded
                    ? "chat-attachment-stack__img"
                    : "chat-attachment-stack__img chat-attachment-stack__img--loading"
                }
                onLoad={() => setCoverLoaded(true)}
              />
            ) : null}
          </span>
          {extraCount > 0 ? (
            <span className="chat-attachment-stack__count">+{extraCount}</span>
          ) : null}
        </button>
      ) : null}
      {other.length > 0 ? (
        <ul className="chat-attachment-downloads">
          {other.map((a) => (
            <li key={a.id} className="chat-attachment-downloads__item">
              <ChatFileLink path={a.storage_path} mime={a.mime_type} />
            </li>
          ))}
        </ul>
      ) : null}
      {captionText ? (
        <p className="chat-attachment-caption">{captionText}</p>
      ) : null}
      {lightboxOpen && imageUrls.length > 0 ? (
        <ChatImageLightbox
          imageUrls={imageUrls}
          onClose={() => setLightboxOpen(false)}
        />
      ) : null}
    </div>
  );
}

function ChatFileLink({ path, mime }: { path: string; mime: string }) {
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
    return <span>Loading… ({mime})</span>;
  }
  return (
    <a href={url} target="_blank" rel="noreferrer">
      {mime.startsWith("video/") ? "Open video" : "Download file"}
    </a>
  );
}
