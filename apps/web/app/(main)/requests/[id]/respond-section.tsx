"use client";

import Link from "next/link";
import { useState } from "react";

import { DismissDrawerLink } from "../../../../components/dismiss-drawer-link";
import { FigmaIcon } from "../../../../components/figma-icons";
import { ResponseOfferForm } from "./response-offer-form";
import { WithdrawResponseForm } from "./withdraw-response-form";

type Props = {
  requestId: string;
  /** Smallest units string for default offer input */
  budgetAmountSmallest: string;
  assetSymbol: string;
  assetDecimals: number;
  hasProfilePhoto: boolean;
  pendingResponseId: string | null;
  preConversationId: string | null;
};

export function RespondSection({
  requestId,
  budgetAmountSmallest,
  assetSymbol,
  assetDecimals,
  hasProfilePhoto,
  pendingResponseId,
  preConversationId,
}: Props) {
  const [offering, setOffering] = useState(false);

  return (
    <section className="offer-form" aria-labelledby="respond-heading">
      <h2 id="respond-heading" className="sr-only">
        Respond to this request
      </h2>

      {!hasProfilePhoto && (
        <div className="detail-section border-0 p-0">
          <h4>Add a profile photo first</h4>
          <p>
            Upload a photo on your account so people know who they’re talking
            to. Any image file works — JPEG, PNG, WebP, or GIF.
          </p>
          <DismissDrawerLink href="/account/edit" className="primary-wide">
            Open account settings
          </DismissDrawerLink>
        </div>
      )}

      {hasProfilePhoto && pendingResponseId && (
        <div className="flex flex-col gap-3 border-t border-[var(--line)] pt-5">
          <p className="text-[13px] text-[var(--muted)]">
            You have a pending response on this request. Withdraw it if you
            change your mind.
          </p>
          {preConversationId && (
            <DismissDrawerLink
              href={`/conversations/${preConversationId}`}
              className="text-[13px] font-bold text-[var(--ink)] underline"
            >
              Open chat with requester
            </DismissDrawerLink>
          )}
          <WithdrawResponseForm
            responseId={pendingResponseId}
            requestId={requestId}
          />
        </div>
      )}

      {hasProfilePhoto && !pendingResponseId && (
        <>
          {!offering ? (
            <button
              type="button"
              className="primary-wide"
              onClick={() => setOffering(true)}
            >
              Make an offer <FigmaIcon name="arrow" size={18} />
            </button>
          ) : (
            <>
              <div className="offer-title">
                <div>
                  <span>YOUR OFFER</span>
                  <h3>How can you help?</h3>
                </div>
                <button
                  type="button"
                  className="close-offer"
                  onClick={() => setOffering(false)}
                  aria-label="Close offer form"
                >
                  <FigmaIcon name="close" size={18} />
                </button>
              </div>
              <ResponseOfferForm
                requestId={requestId}
                budgetAmountSmallest={budgetAmountSmallest}
                assetSymbol={assetSymbol}
                assetDecimals={assetDecimals}
              />
            </>
          )}
        </>
      )}
    </section>
  );
}
