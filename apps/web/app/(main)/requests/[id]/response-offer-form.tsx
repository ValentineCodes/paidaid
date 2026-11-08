"use client";

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";

import { FigmaIcon } from "../../../../components/figma-icons";
import { formatBudgetSmallestUnits } from "../../../../lib/requests/format-budget";
import {
  submitRequestResponse,
  type SubmitResponseState,
} from "../response-actions";

const initial: SubmitResponseState = { error: null };

function SendOfferButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="primary-wide"
    >
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
};

export function ResponseOfferForm({
  requestId,
  budgetAmountSmallest,
  assetSymbol,
  assetDecimals,
}: Props) {
  const router = useRouter();
  const [state, formAction] = useActionState(submitRequestResponse, initial);
  const budgetHuman =
    budgetAmountSmallest !== ""
      ? formatBudgetSmallestUnits(budgetAmountSmallest, assetDecimals)
      : "";

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

  return (
    <form action={formAction} className="flex flex-col">
      <input type="hidden" name="request_id" value={requestId} />
      <input type="hidden" name="headline" value="" />

      <label htmlFor="respond_proposed_human">
        Offer amount
        <div className="amount-input">
          <input
            id="respond_proposed_human"
            name="proposed_human"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            required
            defaultValue={budgetHuman}
            autoComplete="off"
            aria-describedby="respond_budget_hint"
          />
          <span>{assetSymbol}</span>
        </div>
      </label>
      <p
        id="respond_budget_hint"
        className="mt-[-8px] mb-[15px] text-[11px] font-normal text-[var(--muted)]"
      >
        Task budget is {budgetHuman} {assetSymbol} (whole units only).
      </p>
      {state.fieldErrors?.proposedHuman && (
        <p className="mb-3 text-[12px] text-red-700 dark:text-red-300">
          {state.fieldErrors.proposedHuman}
        </p>
      )}

      <label htmlFor="respond_message">
        Message
        <textarea
          id="respond_message"
          name="message"
          placeholder="Introduce yourself and explain how you’d approach this task…"
          maxLength={2000}
        />
      </label>
      {state.fieldErrors?.message && (
        <p className="text-[12px] text-red-700 dark:text-red-300">
          {state.fieldErrors.message}
        </p>
      )}

      {state.error && (
        <p className="mb-3 text-[12px] text-red-700 dark:text-red-300">
          {state.error}
        </p>
      )}

      <SendOfferButton />
    </form>
  );
}
