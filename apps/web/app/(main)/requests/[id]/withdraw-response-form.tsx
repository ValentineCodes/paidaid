"use client";

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";

import {
  withdrawRequestResponse,
  type WithdrawResponseState,
} from "../response-actions";

const initial: WithdrawResponseState = { error: null };

function WithdrawButton({ variant }: { variant: "primary" | "subtle" }) {
  const { pending } = useFormStatus();
  const className =
    variant === "subtle"
      ? "my-pending-offer__withdraw"
      : "primary-wide";
  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? "Withdrawing…" : "Withdraw offer"}
    </button>
  );
}

type Props = {
  responseId: string;
  requestId: string;
  variant?: "primary" | "subtle";
};

export function WithdrawResponseForm({
  responseId,
  requestId,
  variant = "primary",
}: Props) {
  const [state, formAction] = useActionState(withdrawRequestResponse, initial);
  const router = useRouter();

  useEffect(() => {
    if (state.success) {
      router.refresh();
    }
  }, [state.success, router]);

  return (
    <form action={formAction} className="flex w-full flex-col gap-2">
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
      <WithdrawButton variant={variant} />
    </form>
  );
}
