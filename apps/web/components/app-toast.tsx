"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { FigmaIcon } from "./figma-icons";

type Props = {
  message: string;
  visible: boolean;
  onClose: () => void;
  durationMs?: number;
};

export function AppToast({
  message,
  visible,
  onClose,
  durationMs = 3200,
}: Props) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!visible) {
      return;
    }
    const timer = window.setTimeout(onClose, durationMs);
    return () => window.clearTimeout(timer);
  }, [visible, onClose, durationMs]);

  if (!mounted || !visible || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className="app-toast" role="status" aria-live="polite">
      <span className="app-toast__icon" aria-hidden>
        <FigmaIcon name="check" size={16} />
      </span>
      <span>{message}</span>
      <button
        type="button"
        className="app-toast__close"
        onClick={onClose}
        aria-label="Dismiss"
      >
        <FigmaIcon name="close" size={14} />
      </button>
    </div>,
    document.body,
  );
}
