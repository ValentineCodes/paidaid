"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { createClient } from "../../../../lib/supabase/client";
import { LIVE_PROFILE_PHOTOS_BUCKET } from "../../../../lib/constants/storage";
import { confirmLiveProfilePhoto } from "../response-actions";

type Props = {
  onConfirmed?: () => void;
};

export function LiveProfileCapture({ onConfirmed }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [started, setStarted] = useState(false);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    return () => stopStream();
  }, [stopStream]);

  async function startCamera() {
    setError(null);
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setError("Camera is not available in this browser or context.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setStarted(true);
    } catch {
      setError(
        "Could not access the camera. Allow permission and use a secure (HTTPS) origin.",
      );
    }
  }

  async function captureAndUpload() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) {
      setError("Start the camera and wait for the preview first.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setError("You must be signed in.");
        return;
      }

      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        setError("Could not read camera frame.");
        return;
      }
      ctx.drawImage(video, 0, 0);

      const blob: Blob | null = await new Promise((resolve) =>
        canvas.toBlob((b) => resolve(b), "image/jpeg", 0.92),
      );
      if (!blob) {
        setError("Could not encode photo.");
        return;
      }

      const path = `${user.id}/${crypto.randomUUID()}.jpg`;
      const { error: upError } = await supabase.storage
        .from(LIVE_PROFILE_PHOTOS_BUCKET)
        .upload(path, blob, {
          contentType: "image/jpeg",
          upsert: false,
        });

      if (upError) {
        setError(upError.message);
        return;
      }

      const confirm = await confirmLiveProfilePhoto(path);
      if (!confirm.ok) {
        setError(confirm.error);
        return;
      }

      stopStream();
      setStarted(false);
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      onConfirmed?.();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-stone-200 bg-stone-50 p-4 dark:border-stone-700 dark:bg-stone-900/40">
      <p className="text-sm text-stone-700 dark:text-stone-300">
        Take a live photo with your camera to unlock responses. Uploading an
        image from your files does not satisfy this requirement.
      </p>

      {!started ? (
        <button
          type="button"
          onClick={() => void startCamera()}
          className="rounded-lg bg-stone-900 px-3 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-60 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-200"
        >
          Start camera
        </button>
      ) : (
        <>
          <video
            ref={videoRef}
            className="aspect-video w-full rounded-lg bg-black object-cover"
            playsInline
            muted
            aria-label="Live camera preview"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void captureAndUpload()}
              disabled={busy}
              className="rounded-lg bg-stone-900 px-3 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-60 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-200"
            >
              {busy ? "Saving…" : "Capture & save profile photo"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                stopStream();
                setStarted(false);
                if (videoRef.current) {
                  videoRef.current.srcObject = null;
                }
              }}
              className="rounded-lg border border-stone-300 px-3 py-2 text-sm font-medium text-stone-800 hover:bg-stone-100 disabled:opacity-60 dark:border-stone-600 dark:text-stone-200 dark:hover:bg-stone-800"
            >
              Cancel
            </button>
          </div>
        </>
      )}

      {error && (
        <p className="text-sm text-red-700 dark:text-red-300" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
