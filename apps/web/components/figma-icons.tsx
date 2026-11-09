import type { ReactNode } from "react";

/** Inline SVG icons from Figma Make prototype (PaidAid Task Marketplace). */

export type FigmaIconName =
  | "attach"
  | "arrow"
  | "pin"
  | "close"
  | "camera"
  | "check"
  | "briefcase"
  | "spark"
  | "clock"
  | "star"
  | "send"
  | "plus"
  | "edit"
  | "refresh"
  | "chevronLeft"
  | "checks"
  | "message"
  | "bell";

const paths: Record<FigmaIconName, ReactNode> = {
  attach: (
    <>
      <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </>
  ),
  arrow: (
    <>
      <path d="M5 12h14M14 7l5 5-5 5" />
    </>
  ),
  pin: (
    <>
      <path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6 6 18" />,
  camera: (
    <>
      <path d="M4 7h3l2-3h6l2 3h3v13H4Z" />
      <circle cx="12" cy="13" r="4" />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
  briefcase: (
    <>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M8 7V4h8v3M3 12h18M10 12v2h4v-2" />
    </>
  ),
  spark: (
    <>
      <path d="m12 3 1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5Z" />
      <path d="m19 16 .7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7Z" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  star: <path d="m12 2 3 6 7 .9-5 4.8 1.3 6.8-6.3-3.3-6.3 3.3L7 13.7 2 8.9 9 8Z" />,
  send: <path d="m3 3 18 9-18 9 4-9Zm4 9h14" />,
  plus: <path d="M12 5v14M5 12h14" />,
  edit: <path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />,
  refresh: (
    <>
      <path d="M20 5v5h-5" />
      <path d="M4 19v-5h5" />
      <path d="M20 5a8 8 0 0 0-13.5 2.9L4 12" />
      <path d="M4 19a8 8 0 0 0 13.5-2.9L20 12" />
    </>
  ),
  chevronLeft: <path d="m15 18-6-6 6-6" />,
  checks: (
    <>
      <path d="m5 13 3 3 7-7" />
      <path d="m10 13 3 3 7-7" />
    </>
  ),
  message: (
    <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z" />
  ),
  bell: (
    <>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M10 21h4" />
    </>
  ),
};

export function FigmaIcon({
  name,
  size = 20,
  className = "",
}: {
  name: FigmaIconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {paths[name]}
    </svg>
  );
}
