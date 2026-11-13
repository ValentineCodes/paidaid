"use client";

import { useEffect, useMemo, useState } from "react";

import { FigmaIcon } from "../figma-icons";
import { DELIVERY_ATTACHMENTS_BUCKET } from "../../lib/constants/storage";
import { createClient } from "../../lib/supabase/client";

export function ProofFileTile({
  file,
  onRemove,
}: {
  file: File;
  onRemove: () => void;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const isImage = file.type.startsWith("image/");

  useEffect(() => {
    if (!isImage) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file, isImage]);

  return (
    <div className="engagement-proof-tile" title={file.name}>
      <button
        type="button"
        className="engagement-proof-tile__remove"
        onClick={onRemove}
        aria-label={`Remove ${file.name}`}
      >
        <FigmaIcon name="close" size={12} />
      </button>
      {previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- blob preview
        <img src={previewUrl} alt="" />
      ) : (
        <span className="engagement-proof-tile__video" aria-hidden>
          <FigmaIcon name="camera" size={22} />
        </span>
      )}
    </div>
  );
}

export function DeliveryAttachmentTile({
  path,
  mime,
}: {
  path: string;
  mime: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void supabase.storage
      .from(DELIVERY_ATTACHMENTS_BUCKET)
      .createSignedUrl(path, 3600)
      .then(({ data }) => {
        if (!cancelled) {
          setUrl(data?.signedUrl ?? null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [path, supabase]);

  const isImage = mime.startsWith("image/");

  return (
    <li className="engagement-proof-tile">
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="engagement-proof-tile__link"
          aria-label={
            isImage ? "View image proof" : "Open video proof"
          }
        >
          {isImage ? (
            // eslint-disable-next-line @next/next/no-img-element -- signed URL
            <img src={url} alt="" />
          ) : (
            <span className="engagement-proof-tile__video" aria-hidden>
              <FigmaIcon name="camera" size={22} />
            </span>
          )}
        </a>
      ) : null}
    </li>
  );
}

export function DeliveryProofGrid({
  attachments,
}: {
  attachments: { id: string; storage_path: string; mime_type: string }[];
}) {
  if (attachments.length === 0) {
    return null;
  }
  return (
    <ul className="engagement-proof-grid">
      {attachments.map((a) => (
        <DeliveryAttachmentTile
          key={a.id}
          path={a.storage_path}
          mime={a.mime_type}
        />
      ))}
    </ul>
  );
}
