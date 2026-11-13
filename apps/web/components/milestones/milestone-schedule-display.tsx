import type { CSSProperties } from "react";

import { formatBudgetSmallestUnits } from "../../lib/requests/format-budget";
import { parseDigitsIntegerString } from "../../lib/validation/request";
import {
  sumSmallestUnitStrings,
  type MilestoneDisplayRow,
} from "../../lib/milestones/milestone-schedule";

type Props = {
  rows: MilestoneDisplayRow[];
  assetSymbol: string;
  assetDecimals: number;
  heading?: string;
  variant?: "default" | "proposed";
  budgetSmallest?: string | null;
  compact?: boolean;
};

export function MilestoneScheduleDisplay({
  rows,
  assetSymbol,
  assetDecimals,
  heading,
  variant = "default",
  budgetSmallest,
  compact = false,
}: Props) {
  if (rows.length === 0) {
    return null;
  }

  const totalSmallest = sumSmallestUnitStrings(rows.map((r) => r.amountSmallest));
  const budgetDigits = budgetSmallest
    ? parseDigitsIntegerString(budgetSmallest)
    : null;
  const budgetBig = budgetDigits ? BigInt(budgetDigits) : null;
  const matchesBudget =
    budgetBig != null ? totalSmallest === budgetBig : null;
  const fillRatio =
    budgetBig != null && budgetBig > 0n
      ? Math.min(100, Number((totalSmallest * 10000n) / budgetBig) / 100)
      : null;

  const rootClass = [
    "milestone-plan",
    variant === "proposed" ? "milestone-plan--proposed" : "",
    compact ? "milestone-plan--compact" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={rootClass}>
      {heading ? (
        <header className="milestone-plan__header">
          <h4 className="milestone-plan__heading">{heading}</h4>
          {variant === "proposed" ? (
            <span className="milestone-plan__badge milestone-plan__badge--proposed">
              Proposed
            </span>
          ) : (
            <span className="milestone-plan__badge">{rows.length} steps</span>
          )}
        </header>
      ) : variant === "proposed" ? (
        <div className="milestone-plan__meta">
          <span className="milestone-plan__badge milestone-plan__badge--proposed">
            Proposed changes
          </span>
        </div>
      ) : null}

      <ol
        className="milestone-plan__timeline"
        aria-label={heading ?? "Milestone schedule"}
      >
        {rows.map((m, index) => {
          const amountHuman = formatBudgetSmallestUnits(
            m.amountSmallest,
            assetDecimals,
          );
          const isLast = index === rows.length - 1;
          return (
            <li
              key={`${m.position}-${m.title}`}
              className={`milestone-plan__step${isLast ? " milestone-plan__step--last" : ""}`}
            >
              <span className="milestone-plan__rail" aria-hidden>
                <span className="milestone-plan__dot">{m.position}</span>
                {!isLast ? <span className="milestone-plan__line" /> : null}
              </span>
              <article className="milestone-plan__body">
                <div className="milestone-plan__row">
                  <h5 className="milestone-plan__title">{m.title}</h5>
                  <span className="milestone-plan__amount">
                    {amountHuman}{" "}
                    <span className="milestone-plan__amount-symbol">
                      {assetSymbol}
                    </span>
                  </span>
                </div>
                {m.description.trim() ? (
                  <p className="milestone-plan__description">{m.description}</p>
                ) : null}
              </article>
            </li>
          );
        })}
      </ol>

      {!compact && fillRatio != null && budgetSmallest ? (
        <footer className="milestone-plan__footer">
          <div className="milestone-plan__progress">
            <span
              className="milestone-plan__progress-track"
              style={
                {
                  "--milestone-plan-fill": `${fillRatio}%`,
                } as CSSProperties
              }
            >
              <span
                className={`milestone-plan__progress-fill${
                  matchesBudget
                    ? " milestone-plan__progress-fill--ok"
                    : " milestone-plan__progress-fill--warn"
                }`}
              />
            </span>
            <span
              className={`milestone-plan__progress-caption${
                matchesBudget === true
                  ? " milestone-plan__progress-caption--ok"
                  : matchesBudget === false
                    ? " milestone-plan__progress-caption--warn"
                    : ""
              }`}
            >
              {matchesBudget === true
                ? "Matches budget"
                : matchesBudget === false
                  ? "Does not match budget"
                  : ""}
            </span>
          </div>
        </footer>
      ) : null}
    </div>
  );
}
