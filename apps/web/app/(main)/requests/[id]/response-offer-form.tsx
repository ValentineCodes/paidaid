"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { formatBudgetSmallestUnits } from "../../../../lib/requests/format-budget";
import {
  submitRequestResponse,
  type SubmitResponseState,
} from "../response-actions";

const initial: SubmitResponseState = { error: null };

function SubmitResponseButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-stone-900 px-3 py-2.5 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-60 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-200 sm:w-auto"
    >
      {pending ? "Submitting…" : "Submit response"}
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
  const [state, formAction] = useActionState(submitRequestResponse, initial);
  const budgetHuman =
    budgetAmountSmallest !== ""
      ? formatBudgetSmallestUnits(budgetAmountSmallest, assetDecimals)
      : "";

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="request_id" value={requestId} />

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="respond_proposed_human"
          className="text-sm font-medium text-stone-700 dark:text-stone-300"
        >
          Your offer (whole {assetSymbol} units)
        </label>
        <input
          id="respond_proposed_human"
          name="proposed_human"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          required
          defaultValue={budgetHuman}
          autoComplete="off"
          className="rounded-lg border border-stone-300 bg-white px-3 py-2 font-mono text-stone-900 outline-none ring-stone-400 focus:ring-2 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100"
          aria-describedby="respond_budget_hint"
        />
        <p
          id="respond_budget_hint"
          className="text-xs text-stone-500 dark:text-stone-400"
        >
          Indicative budget on the request is {budgetHuman} {assetSymbol} (same
          asset; whole units only).
        </p>
        {state.fieldErrors?.proposedHuman && (
          <p className="text-sm text-red-700 dark:text-red-300">
            {state.fieldErrors.proposedHuman}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="respond_headline"
          className="text-sm font-medium text-stone-700 dark:text-stone-300"
        >
          Provider headline (optional)
        </label>
        <input
          id="respond_headline"
          name="headline"
          type="text"
          maxLength={160}
          className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-stone-900 outline-none ring-stone-400 focus:ring-2 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100"
        />
        {state.fieldErrors?.headline && (
          <p className="text-sm text-red-700 dark:text-red-300">
            {state.fieldErrors.headline}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="respond_message"
          className="text-sm font-medium text-stone-700 dark:text-stone-300"
        >
          Message (optional)
        </label>
        <textarea
          id="respond_message"
          name="message"
          rows={4}
          maxLength={2000}
          className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-stone-900 outline-none ring-stone-400 focus:ring-2 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100"
        />
        {state.fieldErrors?.message && (
          <p className="text-sm text-red-700 dark:text-red-300">
            {state.fieldErrors.message}
          </p>
        )}
      </div>

      {state.error && (
        <p className="text-sm text-red-700 dark:text-red-300">{state.error}</p>
      )}
      {state.success && (
        <p
          className="text-sm text-emerald-800 dark:text-emerald-200"
          role="status"
        >
          Response submitted. The requester will be able to review it.
        </p>
      )}

      <SubmitResponseButton />
    </form>
  );
}
