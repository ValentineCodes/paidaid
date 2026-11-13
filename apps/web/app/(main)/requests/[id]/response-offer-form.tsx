"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";

import { FigmaIcon } from "../../../../components/figma-icons";
import { MilestoneScheduleEditor } from "../../../../components/milestones/milestone-schedule-editor";
import { formatBudgetSmallestUnits } from "../../../../lib/requests/format-budget";
import { sanitizeHumanAmountInput } from "../../../../lib/requests/human-amount-input";
import {
  defaultMilestoneDrafts,
  type MilestoneDisplayRow,
  type MilestoneDraft,
} from "../../../../lib/milestones/milestone-schedule";
import { humanAmountToSmallestUnits } from "../../../../lib/validation/request";
import {
  submitRequestResponse,
  type SubmitResponseState,
} from "../response-actions";

const initial: SubmitResponseState = { error: null };

function SendOfferButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="primary-wide">
      {pending ? "Sending…" : "Send offer"}{" "}
      <FigmaIcon name="send" size={17} />
    </button>
  );
}

type Props = {
  requestId: string;
  budgetAmountSmallest: string;
  assetSymbol: string;
  assetDecimals: number;
  paymentMode: "single" | "milestones";
  requestMilestones: MilestoneDisplayRow[];
};

function milestonesToDrafts(
  rows: MilestoneDisplayRow[],
  decimals: number,
): MilestoneDraft[] {
  return rows.map((r) => ({
    position: r.position,
    title: r.title,
    description: r.description,
    amountHuman: formatBudgetSmallestUnits(r.amountSmallest, decimals),
  }));
}

export function ResponseOfferForm({
  requestId,
  budgetAmountSmallest,
  assetSymbol,
  assetDecimals,
  paymentMode,
  requestMilestones,
}: Props) {
  const router = useRouter();
  const [state, formAction] = useActionState(submitRequestResponse, initial);
  const budgetHuman =
    budgetAmountSmallest !== ""
      ? formatBudgetSmallestUnits(budgetAmountSmallest, assetDecimals)
      : "";

  const [proposedHuman, setProposedHuman] = useState(budgetHuman);
  const [milestoneMode, setMilestoneMode] = useState<"accept" | "propose">(
    "accept",
  );
  const [milestoneDrafts, setMilestoneDrafts] = useState<MilestoneDraft[]>(() =>
    requestMilestones.length > 0
      ? milestonesToDrafts(requestMilestones, assetDecimals)
      : defaultMilestoneDrafts(2),
  );

  const offerBudgetSmallest = useMemo(() => {
    const converted = humanAmountToSmallestUnits(
      proposedHuman.trim(),
      assetDecimals,
    );
    return converted.ok ? converted.smallestUnits : null;
  }, [assetDecimals, proposedHuman]);

  useEffect(() => {
    if (state.success) {
      router.refresh();
    }
  }, [state.success, router]);

  if (state.success) {
    return (
      <div className="sent-state">
        <span>
          <FigmaIcon name="check" />
        </span>
        <h3>Offer sent</h3>
        <p>
          The requester will be notified. You can follow the conversation in
          Messages.
        </p>
      </div>
    );
  }

  const milestoneTask = paymentMode === "milestones";

  return (
    <form action={formAction} className="offer-form-card">
      <input type="hidden" name="request_id" value={requestId} />
      <input type="hidden" name="headline" value="" />
      {milestoneTask ? (
        <>
          <input type="hidden" name="milestone_response_mode" value={milestoneMode} />
          <input
            type="hidden"
            name="milestones_json"
            value={JSON.stringify(milestoneDrafts)}
          />
        </>
      ) : null}

      <section className="offer-form-card__section" aria-labelledby="offer-amount-heading">
        <header className="offer-form-card__section-head">
          <h4 id="offer-amount-heading" className="offer-form-card__section-title">
            Offer
          </h4>
        </header>

        <label htmlFor="respond_proposed_human" className="offer-form-card__amount-label">
          <span className="sr-only">Offer amount</span>
          <div className="amount-input offer-form-card__amount">
            <input
              id="respond_proposed_human"
              name="proposed_human"
              type="text"
              inputMode="decimal"
              required
              value={proposedHuman}
              autoComplete="off"
              aria-describedby="respond_budget_hint"
              onChange={(e) => {
                setProposedHuman(sanitizeHumanAmountInput(e.target.value));
              }}
            />
            <span>{assetSymbol}</span>
          </div>
        </label>
        <p id="respond_budget_hint" className="sr-only">
          Enter the total amount you are offering for this task.
        </p>
        {state.fieldErrors?.proposedHuman ? (
          <p className="offer-form-card__error" role="alert">
            {state.fieldErrors.proposedHuman}
          </p>
        ) : null}
      </section>

      {milestoneTask ? (
        <section
          className="offer-milestone-section"
          aria-labelledby="offer-milestone-heading"
        >
          <h4 id="offer-milestone-heading" className="sr-only">
            Milestones
          </h4>

          <fieldset className="offer-milestone-section__mode">
            <legend className="offer-milestone-section__mode-legend">
              How do you want to respond?
            </legend>
            <div className="offer-milestone-choice" role="group">
              <button
                type="button"
                className={
                  milestoneMode === "accept"
                    ? "offer-milestone-choice__btn offer-milestone-choice__btn--selected"
                    : "offer-milestone-choice__btn"
                }
                onClick={() => setMilestoneMode("accept")}
                aria-pressed={milestoneMode === "accept"}
              >
                <span className="offer-milestone-choice__label">Accept as proposed</span>
                <span className="offer-milestone-choice__hint">
                  Same titles, notes, and amounts
                </span>
              </button>
              <button
                type="button"
                className={
                  milestoneMode === "propose"
                    ? "offer-milestone-choice__btn offer-milestone-choice__btn--selected"
                    : "offer-milestone-choice__btn"
                }
                onClick={() => setMilestoneMode("propose")}
                aria-pressed={milestoneMode === "propose"}
              >
                <span className="offer-milestone-choice__label">Propose changes</span>
                <span className="offer-milestone-choice__hint">
                  Edit milestones for your offer total
                </span>
              </button>
            </div>
          </fieldset>

          {milestoneMode === "propose" ? (
            <div className="offer-milestone-section__editor">
              <MilestoneScheduleEditor
                idPrefix="respond_ms"
                drafts={milestoneDrafts}
                onChange={setMilestoneDrafts}
                assetSymbol={assetSymbol}
                assetDecimals={assetDecimals}
                budgetSmallest={offerBudgetSmallest}
                showIntro={false}
                fieldErrors={
                  state.fieldErrors?.milestones
                    ? { milestones: state.fieldErrors.milestones }
                    : undefined
                }
              />
            </div>
          ) : (
            <div className="offer-milestone-section__accept" role="status">
              <FigmaIcon name="check" size={18} aria-hidden />
              <p>
                You&apos;ll accept the requester&apos;s milestone titles, notes, and
                amounts for your offer total.
              </p>
            </div>
          )}
          {state.fieldErrors?.milestones && milestoneMode === "accept" ? (
            <p className="offer-form-card__error" role="alert">
              {state.fieldErrors.milestones}
            </p>
          ) : null}
        </section>
      ) : null}

      <section className="offer-form-card__section" aria-labelledby="offer-message-heading">
        <header className="offer-form-card__section-head">
          <h4 id="offer-message-heading" className="offer-form-card__section-title">
            Message
          </h4>
        </header>
        <label htmlFor="respond_message" className="offer-form-card__message-label">
          <span className="sr-only">Message</span>
          <textarea
            id="respond_message"
            name="message"
            placeholder="Introduce yourself and explain how you’d approach this task…"
            maxLength={2000}
          />
        </label>
        {state.fieldErrors?.message ? (
          <p className="offer-form-card__error">{state.fieldErrors.message}</p>
        ) : null}
      </section>

      {state.error ? (
        <p className="offer-form-card__error" role="alert">
          {state.error}
        </p>
      ) : null}

      <div className="offer-form-card__submit">
        <SendOfferButton />
      </div>
    </form>
  );
}
