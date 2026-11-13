"use client";

import { useMemo, type CSSProperties } from "react";

import { FigmaIcon } from "../figma-icons";
import { sanitizeHumanAmountInput } from "../../lib/requests/human-amount-input";
import { formatBudgetSmallestUnits } from "../../lib/requests/format-budget";
import {
  MILESTONE_MAX_COUNT,
  MILESTONE_MIN_COUNT,
  formatMilestoneTotalsLine,
  reindexMilestoneDrafts,
  sumSmallestUnitStrings,
  type MilestoneDraft,
  type MilestoneScheduleFieldErrors,
} from "../../lib/milestones/milestone-schedule";
import { humanAmountToSmallestUnits } from "../../lib/validation/request";

type Props = {
  drafts: MilestoneDraft[];
  onChange: (next: MilestoneDraft[]) => void;
  assetSymbol: string;
  assetDecimals: number;
  budgetSmallest: string | null;
  fieldErrors?: MilestoneScheduleFieldErrors;
  idPrefix?: string;
  /** Hide intro callout (e.g. embedded in offer form). */
  showIntro?: boolean;
};

export function MilestoneScheduleEditor({
  drafts,
  onChange,
  assetSymbol,
  assetDecimals,
  budgetSmallest,
  fieldErrors,
  idPrefix = "ms",
  showIntro = true,
}: Props) {
  const totals = useMemo(() => {
    const amountStrings: string[] = [];
    for (const d of drafts) {
      const converted = humanAmountToSmallestUnits(d.amountHuman.trim(), assetDecimals);
      if (converted.ok) {
        amountStrings.push(converted.smallestUnits);
      }
    }
    const total = sumSmallestUnitStrings(amountStrings);
    if (!budgetSmallest) {
      return null;
    }
    return formatMilestoneTotalsLine({
      totalSmallest: total,
      budgetSmallest,
      decimals: assetDecimals,
      symbol: assetSymbol,
      formatHuman: formatBudgetSmallestUnits,
    });
  }, [assetDecimals, assetSymbol, budgetSmallest, drafts]);

  const fillRatio = useMemo(() => {
    if (!totals || !budgetSmallest) {
      return null;
    }
    const budget = BigInt(budgetSmallest);
    if (budget <= 0n) {
      return null;
    }
    const amountStrings: string[] = [];
    for (const d of drafts) {
      const converted = humanAmountToSmallestUnits(d.amountHuman.trim(), assetDecimals);
      if (converted.ok) {
        amountStrings.push(converted.smallestUnits);
      }
    }
    const total = sumSmallestUnitStrings(amountStrings);
    return Math.min(100, Number((total * 10000n) / budget) / 100);
  }, [assetDecimals, budgetSmallest, drafts, totals]);

  function updateAt(index: number, patch: Partial<MilestoneDraft>) {
    const next = drafts.map((d, i) => (i === index ? { ...d, ...patch } : d));
    onChange(next);
  }

  function addMilestone() {
    if (drafts.length >= MILESTONE_MAX_COUNT) {
      return;
    }
    onChange(
      reindexMilestoneDrafts([
        ...drafts,
        {
          position: drafts.length + 1,
          title: "",
          description: "",
          amountHuman: "",
        },
      ]),
    );
  }

  function removeMilestone(index: number) {
    if (drafts.length <= MILESTONE_MIN_COUNT) {
      return;
    }
    onChange(reindexMilestoneDrafts(drafts.filter((_, i) => i !== index)));
  }

  return (
    <MilestoneScheduleEditorView
      drafts={drafts}
      idPrefix={idPrefix}
      assetSymbol={assetSymbol}
      fieldErrors={fieldErrors}
      fillRatio={fillRatio}
      totals={totals}
      updateAt={updateAt}
      removeMilestone={removeMilestone}
      addMilestone={addMilestone}
      showIntro={showIntro}
    />
  );
}

function MilestoneScheduleEditorView({
  drafts,
  idPrefix,
  assetSymbol,
  fieldErrors,
  fillRatio,
  totals,
  updateAt,
  removeMilestone,
  addMilestone,
  showIntro,
}: {
  drafts: MilestoneDraft[];
  idPrefix: string;
  assetSymbol: string;
  fieldErrors?: MilestoneScheduleFieldErrors;
  fillRatio: number | null;
  totals: ReturnType<typeof formatMilestoneTotalsLine> | null;
  updateAt: (index: number, patch: Partial<MilestoneDraft>) => void;
  removeMilestone: (index: number) => void;
  addMilestone: () => void;
  showIntro: boolean;
}) {
  return (
    <div
      className="milestone-plan-editor"
      role="group"
      aria-labelledby={`${idPrefix}-legend`}
    >
      {showIntro ? (
        <MilestonePlanEditorIntro idPrefix={idPrefix} assetSymbol={assetSymbol} />
      ) : (
        <p id={`${idPrefix}-legend`} className="sr-only">
          Edit milestone schedule
        </p>
      )}

      {fieldErrors?.milestones ? (
        <p className="milestone-plan-editor__alert" role="alert">
          {fieldErrors.milestones}
        </p>
      ) : null}

      <ul className="milestone-plan-editor__list">
        {drafts.map((m, index) => {
          const isLast = index === drafts.length - 1;
          return (
            <li
              key={m.position}
              className={`milestone-plan-editor__item${isLast ? " milestone-plan-editor__item--last" : ""}`}
            >
              <span className="milestone-plan-editor__rail" aria-hidden>
                <span className="milestone-plan-editor__dot">{m.position}</span>
                {!isLast ? <span className="milestone-plan-editor__line" /> : null}
              </span>
              <div className="milestone-plan-editor__card">
                <div className="milestone-plan-editor__card-head">
                  <span className="milestone-plan-editor__step-label">
                    Milestone {m.position}
                  </span>
                  {drafts.length > MILESTONE_MIN_COUNT ? (
                    <button
                      type="button"
                      className="milestone-plan-editor__remove"
                      onClick={() => removeMilestone(index)}
                      aria-label={`Remove milestone ${m.position}`}
                    >
                      <FigmaIcon name="close" size={14} />
                      <span>Remove</span>
                    </button>
                  ) : null}
                </div>
                <div className="milestone-plan-editor__fields">
                  <div className="milestone-plan-editor__field">
                    <label
                      htmlFor={`${idPrefix}_title_${m.position}`}
                      className="milestone-plan-editor__label"
                    >
                      Title
                    </label>
                    <input
                      id={`${idPrefix}_title_${m.position}`}
                      className="milestone-plan-editor__control"
                      value={m.title}
                      onChange={(e) => updateAt(index, { title: e.target.value })}
                      maxLength={200}
                      placeholder="Milestone name"
                    />
                  </div>
                  {fieldErrors?.[`milestone_${m.position}_title`] ? (
                    <p className="milestone-plan-editor__field-error">
                      {fieldErrors[`milestone_${m.position}_title`]}
                    </p>
                  ) : null}
                  <div className="milestone-plan-editor__field">
                    <label
                      htmlFor={`${idPrefix}_desc_${m.position}`}
                      className="milestone-plan-editor__label"
                    >
                      Notes{" "}
                      <em className="milestone-plan-editor__optional">(optional)</em>
                    </label>
                    <textarea
                      id={`${idPrefix}_desc_${m.position}`}
                      className="milestone-plan-editor__control milestone-plan-editor__control--textarea"
                      value={m.description}
                      onChange={(e) =>
                        updateAt(index, { description: e.target.value })
                      }
                      maxLength={4000}
                      rows={2}
                      placeholder="What you expect at this step"
                    />
                  </div>
                  <div className="milestone-plan-editor__field milestone-plan-editor__field--amount">
                    <label
                      htmlFor={`${idPrefix}_amount_${m.position}`}
                      className="milestone-plan-editor__label"
                    >
                      Amount
                    </label>
                    <div className="amount-input milestone-plan-editor__amount">
                      <input
                        id={`${idPrefix}_amount_${m.position}`}
                        className="milestone-plan-editor__control"
                        inputMode="decimal"
                        autoComplete="off"
                        value={m.amountHuman}
                        onChange={(e) =>
                          updateAt(index, {
                            amountHuman: sanitizeHumanAmountInput(e.target.value),
                          })
                        }
                        placeholder="0.00"
                        aria-describedby={`${idPrefix}_amount_hint_${m.position}`}
                      />
                      <span aria-hidden>{assetSymbol}</span>
                    </div>
                  </div>
                  {fieldErrors?.[`milestone_${m.position}_amount`] ? (
                    <p className="milestone-plan-editor__field-error">
                      {fieldErrors[`milestone_${m.position}_amount`]}
                    </p>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {drafts.length < MILESTONE_MAX_COUNT ? (
        <button
          type="button"
          className="milestone-plan-editor__add"
          onClick={addMilestone}
        >
          <FigmaIcon name="plus" size={14} />
          Add milestone
          <span className="milestone-plan-editor__add-hint">
            ({MILESTONE_MAX_COUNT - drafts.length} remaining)
          </span>
        </button>
      ) : null}

      {totals ? (
        <div
          className={`milestone-plan-editor__summary${
            totals.matches
              ? " milestone-plan-editor__summary--ok"
              : " milestone-plan-editor__summary--warn"
          }`}
          role="status"
        >
          <div className="milestone-plan-editor__summary-row">
            <span>
              Milestone total:{" "}
              <strong>
                {totals.totalHuman} {assetSymbol}
              </strong>
            </span>
            <span>
              Budget:{" "}
              <strong>
                {totals.budgetHuman} {assetSymbol}
              </strong>
            </span>
          </div>
          {fillRatio != null ? (
            <span
              className="milestone-plan-editor__progress-track"
              style={
                { "--milestone-plan-fill": `${fillRatio}%` } as CSSProperties
              }
            >
              <span
                className={`milestone-plan-editor__progress-fill${
                  totals.matches
                    ? " milestone-plan-editor__progress-fill--ok"
                    : " milestone-plan-editor__progress-fill--warn"
                }`}
              />
            </span>
          ) : null}
          <p className="milestone-plan-editor__summary-caption">
            {totals.matches ? (
              <>
                <FigmaIcon name="check" size={14} aria-hidden />
                Amounts match the task budget
              </>
            ) : (
              <>
                {totals.remainingHuman} {assetSymbol} left to allocate across milestones
              </>
            )}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function MilestonePlanEditorIntro({
  idPrefix,
  assetSymbol,
}: {
  idPrefix: string;
  assetSymbol: string;
}) {
  return (
    <div className="milestone-plan-editor__intro" id={`${idPrefix}-legend`}>
      <FigmaIcon name="spark" size={16} aria-hidden />
      <p>
        Split the task into {MILESTONE_MIN_COUNT}–{MILESTONE_MAX_COUNT} steps. Each amount
        is in <strong>{assetSymbol}</strong> and must sum exactly to the offer total.
      </p>
    </div>
  );
}
