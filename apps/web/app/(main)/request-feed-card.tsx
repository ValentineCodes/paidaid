import Link from "next/link";

import { formatBudgetSmallestUnits } from "../../lib/requests/format-budget";
import { categoryDotClassForLabel } from "../../lib/requests/category-dot";
import { formatPostedRelative } from "../../lib/datetime/relative-from-now";
import type { Tables } from "../../lib/database.types";

export type FeedCardRow = {
  id: string;
  title: string;
  description_preview: string | null;
  timing_type: Tables<"requests">["timing_type"];
  scheduled_at: string | null;
  deadline_at: string | null;
  budget_amount: string | number;
  asset_symbol: string;
  asset_decimals: number;
  location_kind: Tables<"requests">["location_kind"];
  location_label: string | null;
  published_at: string | null;
  tags: unknown;
  first_photo_path: string | null;
};

type PublicTag = {
  id: string;
  label: string;
};

function parseTags(raw: unknown): PublicTag[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter(
    (t): t is PublicTag =>
      typeof t === "object" &&
      t !== null &&
      "id" in t &&
      "label" in t &&
      typeof (t as PublicTag).id === "string" &&
      typeof (t as PublicTag).label === "string",
  );
}

function Icon({
  name,
  size = 16,
}: {
  name: "pin" | "spark" | "clock";
  size?: number;
}) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none" as const,
    stroke: "currentColor" as const,
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };
  if (name === "pin") {
    return (
      <svg {...common}>
        <path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" />
        <circle cx="12" cy="10" r="2.5" />
      </svg>
    );
  }
  if (name === "spark") {
    return (
      <svg {...common}>
        <path d="m12 3 1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5Z" />
        <path d="m19 16 .7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7Z" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function formatDueLine(row: FeedCardRow): string {
  if (row.deadline_at) {
    const d = new Date(row.deadline_at);
    if (!Number.isNaN(d.getTime())) {
      return `Due ${formatShortDate(d)}`;
    }
  }
  if (row.timing_type === "scheduled" && row.scheduled_at) {
    const d = new Date(row.scheduled_at);
    if (!Number.isNaN(d.getTime())) {
      return formatShortDate(d);
    }
  }
  if (row.timing_type === "immediate") {
    return "Flexible";
  }
  return "—";
}

function formatShortDate(d: Date) {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function RequestFeedCard({
  row,
  nowMs,
}: {
  row: FeedCardRow;
  nowMs: number;
}) {
  const tags = parseTags(row.tags);
  const primaryTag = tags[0];
  const categoryLabel = primaryTag?.label ?? "Open";
  const budgetHuman = formatBudgetSmallestUnits(
    row.budget_amount,
    row.asset_decimals,
  );
  const place =
    row.location_kind === "unspecified"
      ? "Anywhere"
      : row.location_kind === "online"
        ? "Online"
        : row.location_label?.trim() || "In person";
  const due = formatDueLine(row);
  const timeLabel = row.published_at
    ? formatPostedRelative(new Date(row.published_at), nowMs)
    : "—";

  const locIcon: "pin" | "spark" =
    row.location_kind === "online" ? "spark" : "pin";

  return (
    <Link href={`/requests/${row.id}`} className="task-card">
      <div className="card-top">
        <span className={`category-dot ${categoryDotClassForLabel(categoryLabel)}`} />
        <span>{categoryLabel}</span>
        <span className="posted">{timeLabel}</span>
      </div>
      <h3>{row.title}</h3>
      <div className="budget">
        {budgetHuman} {row.asset_symbol}
      </div>
      <div className="meta-row">
        <span>
          <Icon name={locIcon} size={16} />
          {place}
        </span>
        <span>
          <Icon name="clock" size={16} />
          {due}
        </span>
      </div>
    </Link>
  );
}
