"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, useTransition } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { explorerTransactionUrl } from "@paidaid/near";
import { parseNearNetworkId } from "@paidaid/shared";
import {
  formatPaymentActivityAmount,
  paymentActivityKindLabel,
  paymentActivityStatusClass,
  paymentActivityStatusLabel,
  paymentActivityCompletedCopy,
} from "../../../lib/payments/payment-activity-format";
import type {
  PaymentActivityFilter,
  PaymentActivityPageData,
  PaymentActivityRow,
  PaymentEventKind,
  PaymentEventStatus,
} from "../../../lib/payments/payment-activity-types";
import {
  loadPaymentActivityPage,
  reconcileMyPaymentActivity,
} from "./payment-activity-actions";

type Props = {
  initial: PaymentActivityPageData;
};

const KIND_FILTERS: { value: PaymentEventKind | ""; label: string }[] = [
  { value: "", label: "All types" },
  { value: "funding", label: "Funding" },
  { value: "payout", label: "Payout" },
  { value: "refund", label: "Refund" },
];

const STATUS_FILTERS: { value: PaymentEventStatus | ""; label: string }[] = [
  { value: "", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "success", label: "Confirmed" },
  { value: "failed", label: "Failed" },
];

function SummaryCard({
  label,
  amountSmallestUnits,
  decimals,
  symbol,
  count,
}: {
  label: string;
  amountSmallestUnits: string;
  decimals: number;
  symbol: string;
  count: number;
}) {
  const display =
    amountSmallestUnits === "0"
      ? "—"
      : formatPaymentActivityAmount(amountSmallestUnits, decimals, symbol);
  return (
    <div className="rounded-lg border border-stone-200 bg-white px-4 py-3 dark:border-stone-800 dark:bg-stone-950">
      <p className="text-xs uppercase tracking-wide text-stone-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-stone-900 dark:text-stone-100">
        {display}
      </p>
      <p className="text-xs text-stone-500">
        {count} engagement{count === 1 ? "" : "s"}
      </p>
    </div>
  );
}

function ActivityLine({
  row,
  networkId,
}: {
  row: PaymentActivityRow;
  networkId: string;
}) {
  const explorer =
    row.txHash && (networkId === "testnet" || networkId === "mainnet")
      ? explorerTransactionUrl(networkId as "testnet" | "mainnet", row.txHash)
      : null;
  const statusClass = paymentActivityStatusClass(row.status);
  const amountLabel = formatPaymentActivityAmount(
    row.amountSmallestUnits,
    row.assetDecimals,
    row.assetSymbol,
  );
  const when = new Date(row.occurredAt).toLocaleString();
  const confirmed =
    paymentActivityCompletedCopy(row.status) && row.confirmedAt
      ? new Date(row.confirmedAt).toLocaleString()
      : null;

  return (
    <div className="activity-card">
      <span className={`status ${statusClass}`}>
        {paymentActivityStatusLabel(row.status).toUpperCase()} ·{" "}
        {paymentActivityKindLabel(row.kind).toUpperCase()}
      </span>
      <h3>{row.requestTitle}</h3>
      <div className="text-sm text-stone-600 dark:text-stone-400">
        <p>
          {amountLabel} · {row.chainId} ·{" "}
          {row.viewerRole === "requester" ? "You funded" : "You receive"}
        </p>
        <p className="mt-1">
          {paymentActivityCompletedCopy(row.status)
            ? "Confirmed"
            : "Not confirmed"}{" "}
          · {when}
          {confirmed ? ` (on-chain ${confirmed})` : null}
        </p>
        {row.txHash ? (
          <p className="mt-1 font-mono text-xs break-all">{row.txHash}</p>
        ) : (
          <p className="mt-1 text-xs text-stone-500">No transaction hash yet</p>
        )}
        {row.lastError ? (
          <p className="mt-1 text-xs text-red-700 dark:text-red-300">
            {row.lastError}
          </p>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap gap-3">
        <Link href={`/engagements/${row.engagementId}`}>
          View engagement <span aria-hidden>→</span>
        </Link>
        {explorer ? (
          <a href={explorer} target="_blank" rel="noopener noreferrer">
            NEAR Explorer <span aria-hidden>↗</span>
          </a>
        ) : null}
      </div>
    </div>
  );
}

export function PaymentActivitySection({ initial }: Props) {
  const [data, setData] = useState(initial);
  const [filter, setFilter] = useState<PaymentActivityFilter>({});
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const networkId = parseNearNetworkId(process.env.NEXT_PUBLIC_NEAR_NETWORK_ID);

  const primaryDecimals = data.items[0]?.assetDecimals ?? 24;
  const primarySymbol = data.items[0]?.assetSymbol ?? "NEAR";

  const refresh = useCallback(() => {
    startTransition(async () => {
      setError(null);
      const result = await loadPaymentActivityPage({ offset: 0, filter });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setData(result.data);
      setOffset(0);
    });
  }, [filter]);

  useEffect(() => {
    startTransition(async () => {
      const reconciled = await reconcileMyPaymentActivity();
      if (reconciled.ok && reconciled.updated > 0) {
        const result = await loadPaymentActivityPage({ offset: 0, filter });
        if (result.ok) {
          setData(result.data);
        }
      }
    });
  }, []);

  const loadMore = () => {
    const next = offset + data.items.length;
    startTransition(async () => {
      setError(null);
      const result = await loadPaymentActivityPage({ offset: next, filter });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setData((prev) => ({
        ...result.data,
        items: [...prev.items, ...result.data.items],
      }));
      setOffset(next);
    });
  };

  const onFilterChange = (next: PaymentActivityFilter) => {
    setFilter(next);
    startTransition(async () => {
      setError(null);
      const result = await loadPaymentActivityPage({ offset: 0, filter: next });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setData(result.data);
      setOffset(0);
    });
  };

  const empty = data.items.length === 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          label="Total funded"
          amountSmallestUnits={data.summary.totalFundedSmallestUnits}
          decimals={primaryDecimals}
          symbol={primarySymbol}
          count={data.summary.fundedCount}
        />
        <SummaryCard
          label="Locked in escrow"
          amountSmallestUnits={data.summary.lockedInEscrowSmallestUnits}
          decimals={primaryDecimals}
          symbol={primarySymbol}
          count={data.summary.lockedCount}
        />
        <SummaryCard
          label="Received"
          amountSmallestUnits={data.summary.totalReceivedSmallestUnits}
          decimals={primaryDecimals}
          symbol={primarySymbol}
          count={data.summary.receivedCount}
        />
        <SummaryCard
          label="Refunded"
          amountSmallestUnits={data.summary.totalRefundedSmallestUnits}
          decimals={primaryDecimals}
          symbol={primarySymbol}
          count={data.summary.refundCount}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={filter.kind ?? ""}
          onValueChange={(value) =>
            onFilterChange({
              ...filter,
              kind: ((value ?? "") || null) as PaymentEventKind | null,
            })
          }
        >
          <SelectTrigger
            size="sm"
            className="w-fit"
            aria-label="Filter by type"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {KIND_FILTERS.map((o) => (
              <SelectItem key={o.label} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={filter.status ?? ""}
          onValueChange={(value) =>
            onFilterChange({
              ...filter,
              status: ((value ?? "") || null) as PaymentEventStatus | null,
            })
          }
        >
          <SelectTrigger
            size="sm"
            className="w-fit"
            aria-label="Filter by status"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTERS.map((o) => (
              <SelectItem key={o.label} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <button
          type="button"
          onClick={refresh}
          disabled={isPending}
          className="rounded border border-stone-300 px-3 py-1 text-sm disabled:opacity-50 dark:border-stone-700"
        >
          Refresh
        </button>
      </div>

      {error ? (
        <p className="text-sm text-red-700 dark:text-red-300" role="alert">
          {error}
        </p>
      ) : null}

      {isPending && empty ? (
        <p className="py-8 text-sm text-[var(--muted)]" role="status">
          Loading payments…
        </p>
      ) : empty ? (
        <p className="py-8 text-sm text-[var(--muted)]" role="status">
          No payment activity yet. Fund an engagement escrow or complete a
          payout to see history here.
        </p>
      ) : (
        <div className="activity-list">
          {data.items.map((row) => (
            <ActivityLine key={row.eventId} row={row} networkId={networkId} />
          ))}
        </div>
      )}

      {data.hasMore ? (
        <button
          type="button"
          onClick={loadMore}
          disabled={isPending}
          className="mx-auto rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium disabled:opacity-50 dark:border-stone-700"
        >
          Load more
        </button>
      ) : null}
    </div>
  );
}
