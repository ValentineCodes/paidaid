"use client";

import { useState } from "react";

import { DismissDrawerLink } from "../../../../components/dismiss-drawer-link";
import { FigmaIcon } from "../../../../components/figma-icons";
import { MilestoneScheduleDisplay } from "../../../../components/milestones/milestone-schedule-display";
import { PreAcceptChatLink } from "../../../../components/pre-accept-chat-link";
import { formatPostedRelative } from "../../../../lib/datetime/relative-from-now";
import { formatBudgetSmallestUnits } from "../../../../lib/requests/format-budget";
import type {
  PreAcceptChatLinkState,
  ProviderPendingResponse,
} from "./request-detail-data";
import type { MilestoneDisplayRow } from "../../../../lib/milestones/milestone-schedule";
import { ResponseOfferForm } from "./response-offer-form";
import { WithdrawResponseForm } from "./withdraw-response-form";

type Props = {
  requestId: string;
  /** Smallest units string for default offer input */
  budgetAmountSmallest: string;
  assetSymbol: string;
  assetDecimals: number;
  nowMs: number;
  pendingResponse: ProviderPendingResponse | null;
  preAcceptChat: PreAcceptChatLinkState | null;
  paymentMode: "single" | "milestones";
  requestMilestones: MilestoneDisplayRow[];
};

export function RespondSection({
  requestId,
  budgetAmountSmallest,
  assetSymbol,
  assetDecimals,
  nowMs,
  pendingResponse,
  preAcceptChat,
  paymentMode,
  requestMilestones,
}: Props) {
  const [offering, setOffering] = useState(false);
  const pendingMilestoneRows = pendingResponse?.milestoneRows ?? [];
  const milestoneTask =
    paymentMode === "milestones" &&
    (pendingResponse
      ? pendingMilestoneRows.length > 0
      : requestMilestones.length > 0);

  return (
    <section className="offer-form" aria-labelledby="respond-heading">
      <h2 id="respond-heading" className="sr-only">
        Respond to this request
      </h2>

      {pendingResponse ? (
        <div className="my-pending-offer">
          <header className="my-pending-offer__head">
            <div className="min-w-0 flex-1">
              <p className="my-pending-offer__eyebrow">Your pending offer</p>
              <p className="my-pending-offer__status">
                <span className="my-pending-offer__pill">Awaiting requester</span>
                {milestoneTask ? (
                  <span className="my-pending-offer__pill my-pending-offer__pill--milestones">
                    Milestones
                  </span>
                ) : null}
                <time
                  dateTime={pendingResponse.createdAt}
                  className="my-pending-offer__time"
                >
                  {formatPostedRelative(
                    new Date(pendingResponse.createdAt),
                    nowMs,
                  )}
                </time>
              </p>
            </div>
            {preAcceptChat ? (
              <PreAcceptChatLink
                as={DismissDrawerLink}
                href={`/messages/${preAcceptChat.conversationId}`}
                hasUnread={preAcceptChat.hasUnread}
                aria-label={
                  preAcceptChat.hasUnread
                    ? "Chat with requester (unread)"
                    : "Chat with requester"
                }
                className="shrink-0"
              />
            ) : null}
          </header>

          <div className="my-pending-offer__amount">
            <span className="my-pending-offer__amount-label">Proposed amount</span>
            <p className="my-pending-offer__amount-value">
              {formatBudgetSmallestUnits(
                pendingResponse.proposedAmountSmallest,
                assetDecimals,
              )}{" "}
              <span>{assetSymbol}</span>
            </p>
          </div>

          {milestoneTask && pendingMilestoneRows.length > 0 ? (
            <div className="my-pending-offer__milestones">
              <MilestoneScheduleDisplay
                rows={pendingMilestoneRows}
                assetSymbol={assetSymbol}
                assetDecimals={assetDecimals}
                budgetSmallest={pendingResponse.proposedAmountSmallest}
                compact
              />
            </div>
          ) : null}

          {pendingResponse.headline ? (
            <p className="my-pending-offer__headline">{pendingResponse.headline}</p>
          ) : null}

          {pendingResponse.message ? (
            <blockquote className="my-pending-offer__message">
              {pendingResponse.message}
            </blockquote>
          ) : null}

          <div className="my-pending-offer__footer">
            <WithdrawResponseForm
              responseId={pendingResponse.id}
              requestId={requestId}
              variant="subtle"
            />
          </div>
        </div>
      ) : (
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
            <div className="offer-form-shell">
              <header className="offer-title">
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
              </header>
              <ResponseOfferForm
                requestId={requestId}
                budgetAmountSmallest={budgetAmountSmallest}
                assetSymbol={assetSymbol}
                assetDecimals={assetDecimals}
                paymentMode={paymentMode}
                requestMilestones={requestMilestones}
              />
            </div>
          )}
        </>
      )}
    </section>
  );
}
