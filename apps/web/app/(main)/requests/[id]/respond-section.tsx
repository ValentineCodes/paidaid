"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { LiveProfileCapture } from "./live-profile-capture";
import { ResponseOfferForm } from "./response-offer-form";
import { WithdrawResponseForm } from "./withdraw-response-form";

type Props = {
  requestId: string;
  /** Smallest units string for default offer input */
  budgetAmountSmallest: string;
  assetSymbol: string;
  assetDecimals: number;
  hasLiveProfilePhoto: boolean;
  pendingResponseId: string | null;
  preConversationId: string | null;
};

export function RespondSection({
  requestId,
  budgetAmountSmallest,
  assetSymbol,
  assetDecimals,
  hasLiveProfilePhoto,
  pendingResponseId,
  preConversationId,
}: Props) {
  const router = useRouter();

  return (
    <section
      className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-700 dark:bg-stone-950"
      aria-labelledby="respond-heading"
    >
      <h2
        id="respond-heading"
        className="text-lg font-medium text-stone-900 dark:text-stone-100"
      >
        Respond to this request
      </h2>

      {!hasLiveProfilePhoto && (
        <div className="mt-4">
          <p className="mb-2 text-sm text-stone-600 dark:text-stone-400">
            You need a live camera profile photo before you can respond.
          </p>
          <LiveProfileCapture onConfirmed={() => router.refresh()} />
        </div>
      )}

      {hasLiveProfilePhoto && pendingResponseId && (
        <div className="mt-4 flex flex-col gap-3">
          <p className="text-sm text-stone-700 dark:text-stone-300">
            You have a pending response on this request. You can withdraw it if
            you change your mind.
          </p>
          {preConversationId && (
            <Link
              href={`/conversations/${preConversationId}`}
              className="text-sm font-medium text-stone-900 underline dark:text-stone-100"
            >
              Open chat with requester
            </Link>
          )}
          <WithdrawResponseForm
            responseId={pendingResponseId}
            requestId={requestId}
          />
        </div>
      )}

      {hasLiveProfilePhoto && !pendingResponseId && (
        <div className="mt-4">
          <ResponseOfferForm
            requestId={requestId}
            budgetAmountSmallest={budgetAmountSmallest}
            assetSymbol={assetSymbol}
            assetDecimals={assetDecimals}
          />
        </div>
      )}
    </section>
  );
}
