"use client";

import { useMemo, useState } from "react";
import { cn } from "cn";

/** Design reference is 261 characters; rounded up for the collapsed preview cap. */
export const DESCRIPTION_COLLAPSED_MAX_CHARS = 270;

type Props = {
  text: string;
  className?: string;
  /** Max characters shown before “Show more”. */
  maxChars?: number;
};

function collapsedPreview(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }
  let cut = text.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(" ");
  if (lastSpace > Math.floor(maxChars * 0.75)) {
    cut = cut.slice(0, lastSpace);
  }
  return `${cut}…`;
}

export function TruncatedText({
  text,
  className,
  maxChars = DESCRIPTION_COLLAPSED_MAX_CHARS,
}: Props) {
  const trimmed = text.trim();
  const [expanded, setExpanded] = useState(false);

  const needsTruncate = useMemo(
    () => trimmed.length > maxChars,
    [trimmed, maxChars],
  );

  if (!trimmed) {
    return null;
  }

  if (!needsTruncate) {
    return (
      <p className={cn("whitespace-pre-wrap", className)}>{trimmed}</p>
    );
  }

  const visible = expanded ? trimmed : collapsedPreview(trimmed, maxChars);

  return (
    <div>
      <p className={cn("whitespace-pre-wrap", className)}>{visible}</p>
      <button
        type="button"
        className="truncated-text__toggle"
        aria-expanded={expanded}
        onClick={() => setExpanded((open) => !open)}
      >
        {expanded ? "Show less" : "Show more"}
      </button>
    </div>
  );
}
