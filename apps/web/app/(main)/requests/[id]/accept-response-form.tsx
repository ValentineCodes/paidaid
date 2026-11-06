"use client";

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";

import {
  acceptRequestResponse,
  type AcceptResponseState,
} from "../response-actions";

const initial: AcceptResponseState = { error: null };

function AcceptOfferButton({ disabled }: { disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="mt-3 rounded-lg bg-stone-900 px-3 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-60 dark:bg-[#edf2ed] dark:text-[#101614] dark:hover:bg-[#dde5df]"
    >
      {pending ? "Accepting…" : "Accept this offer"}
    </button>
  );
}

type Props = {
  requestId: string;
  responseId: string;
};

export function AcceptResponseForm({ requestId, responseId }: Props) {
  const [state, formAction] = useActionState(acceptRequestResponse, initial);
  const router = useRouter();

  useEffect(() => {
    if (state.success) {
      router.refresh();
    }
  }, [state.success, router]);

  return (
    <form action={formAction} className="flex flex-col">
      <input type="hidden" name="request_id" value={requestId} />
      <input type="hidden" name="response_id" value={responseId} />
      {state.error && (
        <p className="text-sm text-red-700 dark:text-red-300">{state.error}</p>
      )}
      {state.success && (
        <p className="text-sm text-emerald-800 dark:text-emerald-200">
          Offer accepted.
        </p>
      )}
      <AcceptOfferButton disabled={state.success} />
    </form>
  );
}
