"use client";

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";

import {
  withdrawRequestResponse,
  type WithdrawResponseState,
} from "../response-actions";

const initial: WithdrawResponseState = { error: null };

function WithdrawButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg border border-stone-400 px-3 py-1.5 text-sm font-medium text-stone-800 hover:bg-stone-100 disabled:opacity-60 dark:border-stone-500 dark:text-stone-200 dark:hover:bg-stone-800"
    >
      {pending ? "Withdrawing…" : "Withdraw response"}
    </button>
  );
}

type Props = {
  responseId: string;
  requestId: string;
};

export function WithdrawResponseForm({ responseId, requestId }: Props) {
  const [state, formAction] = useActionState(withdrawRequestResponse, initial);
  const router = useRouter();

  useEffect(() => {
    if (state.success) {
      router.refresh();
    }
  }, [state.success, router]);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="response_id" value={responseId} />
      <input type="hidden" name="request_id" value={requestId} />
      {state.error && (
        <p className="text-sm text-red-700 dark:text-red-300">{state.error}</p>
      )}
      {state.success && (
        <p className="text-sm text-emerald-800 dark:text-emerald-200">
          Response withdrawn.
        </p>
      )}
      <WithdrawButton />
    </form>
  );
}
