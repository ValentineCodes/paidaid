"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { FigmaIcon } from "../../../../components/figma-icons";
import type {
  ActivityData,
  ActivityEngagementCard,
  ActivityOfferCard,
  ActivityPostedCard,
  ActivityTab,
} from "./activity-data";
import { PaymentActivitySection } from "./payment-activity-section";

const TABS: ActivityTab[] = [
  "Posted",
  "Offers",
  "In progress",
  "Completed",
  "Payments",
];

function CardButton({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  return (
    <Link href={href}>
      {label} <FigmaIcon name="arrow" size={16} />
    </Link>
  );
}

function PostedCard({ c }: { c: ActivityPostedCard }) {
  return (
    <div className="activity-card">
      <span className={`status ${c.statusClass}`}>{c.statusText}</span>
      <h3>{c.title}</h3>
      <div>
        <span>
          {c.budgetHuman} {c.symbol}
        </span>
        <span>{c.dueShort}</span>
      </div>
      <CardButton href={c.href} label={c.ctaLabel} />
    </div>
  );
}

function OfferCard({ c }: { c: ActivityOfferCard }) {
  return (
    <div className="activity-card">
      <span className={`status ${c.statusClass}`}>{c.statusText}</span>
      <h3>{c.title}</h3>
      <div>
        <span>
          {c.budgetHuman} {c.symbol}
        </span>
        <span>{c.dueShort}</span>
      </div>
      <CardButton href={c.href} label={c.ctaLabel} />
    </div>
  );
}

function EngagementCard({ c }: { c: ActivityEngagementCard }) {
  return (
    <div className="activity-card">
      <span className={`status ${c.statusClass}`}>{c.statusText}</span>
      <h3>{c.title}</h3>
      <div>
        <span>
          {c.budgetHuman} {c.symbol}
        </span>
        <span>{c.dueShort}</span>
      </div>
      <CardButton href={c.href} label={c.ctaLabel} />
    </div>
  );
}

function EmptyTab({ tab }: { tab: ActivityTab }) {
  const msg =
    tab === "Posted"
      ? "You haven’t posted a task yet."
      : tab === "Offers"
        ? "You haven’t made any offers yet."
        : tab === "In progress"
        ? "Nothing in progress right now."
        : tab === "Payments"
          ? "No payment activity yet."
          : "No completed work to show yet.";
  return (
    <p className="py-8 text-sm text-[var(--muted)]" role="status">
      {msg}
    </p>
  );
}

const TAB_FROM_QUERY: Record<string, ActivityTab> = {
  posted: "Posted",
  offers: "Offers",
  progress: "In progress",
  completed: "Completed",
  payments: "Payments",
};

export function ActivityShell({ data }: { data: ActivityData }) {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<ActivityTab>("Posted");

  useEffect(() => {
    const q = searchParams.get("tab")?.toLowerCase();
    if (q && TAB_FROM_QUERY[q]) {
      setTab(TAB_FROM_QUERY[q]);
    }
  }, [searchParams]);

  const list =
    tab === "Posted"
      ? data.posted
      : tab === "Offers"
        ? data.offers
        : tab === "In progress"
        ? data.inProgress
        : tab === "Payments"
          ? data.payments.items
          : data.completed;

  return (
    <main className="inner-page">
      <div className="page-heading">
        <span>YOUR WORK</span>
        <h1>Activity</h1>
        <p>Everything you’ve posted, offered on, and started.</p>
      </div>

      <div className="segment" role="tablist" aria-label="Activity views">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            className={tab === t ? "active" : ""}
            onClick={() => setTab(t)}
          >
            {t}
            <span>{data.counts[t]}</span>
          </button>
        ))}
      </div>

      <div className="activity-list" role="tabpanel">
        {tab === "Posted" &&
          (list.length === 0 ? (
            <EmptyTab tab="Posted" />
          ) : (
            (list as ActivityPostedCard[]).map((c) => (
              <PostedCard key={c.id} c={c} />
            ))
          ))}

        {tab === "Offers" &&
          (list.length === 0 ? (
            <EmptyTab tab="Offers" />
          ) : (
            (list as ActivityOfferCard[]).map((c) => (
              <OfferCard key={c.id} c={c} />
            ))
          ))}

        {tab === "In progress" &&
          (list.length === 0 ? (
            <EmptyTab tab="In progress" />
          ) : (
            (list as ActivityEngagementCard[]).map((c) => (
              <EngagementCard key={c.id} c={c} />
            ))
          ))}

        {tab === "Completed" &&
          (list.length === 0 ? (
            <EmptyTab tab="Completed" />
          ) : (
            (list as ActivityEngagementCard[]).map((c) => (
              <EngagementCard key={c.id} c={c} />
            ))
          ))}

        {tab === "Payments" && (
          <PaymentActivitySection initial={data.payments} />
        )}

        {tab === "Posted" && (
          <Link href="/?create=1" className="new-task-card">
            <FigmaIcon name="plus" size={24} />
            <span>
              <strong>Post another task</strong>
              <small>Tell the community what you need.</small>
            </span>
          </Link>
        )}
      </div>
    </main>
  );
}
