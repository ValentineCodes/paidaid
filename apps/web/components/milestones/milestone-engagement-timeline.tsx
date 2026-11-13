"use client";

import { FigmaIcon } from "../figma-icons";
import { formatBudgetSmallestUnits } from "../../lib/requests/format-budget";
import {
  milestoneCanProviderSubmit,
  milestoneDotVariant,
} from "../../lib/engagement/milestone-dot-variant";
import type { Database } from "../../lib/database.types";

type MilestoneStatus = Database["public"]["Enums"]["milestone_workflow_status"];

type StatusBadge = {
  label: string;
  variant: "pending" | "warning" | "success" | "muted" | "progress";
  icon?: "clock" | "spark" | "checks";
};

export type EngagementMilestoneStep = {
  id: string;
  position: number;
  title: string;
  description: string;
  amountSmallest: string;
  status: Database["public"]["Enums"]["milestone_workflow_status"];
};

type Props = {
  milestones: EngagementMilestoneStep[];
  assetSymbol: string;
  assetDecimals: number;
  isProvider: boolean;
  isRequester: boolean;
  paymentFunded: boolean;
  onSubmitClick: (milestone: EngagementMilestoneStep) => void;
  onReviewClick: (milestone: EngagementMilestoneStep) => void;
  onReleaseClick: (milestoneId: string) => void;
  releaseBusyId: string | null;
  releasableMilestoneId: string | null;
  nextReleasePosition: number;
};

function statusBadge(
  status: MilestoneStatus,
  isProvider: boolean,
): StatusBadge | null {
  switch (status) {
    case "pending_review":
      if (!isProvider) {
        return null;
      }
      return {
        label: "Awaiting review",
        variant: "pending",
        icon: "clock",
      };
    case "release_eligible":
      return { label: "Approved", variant: "success", icon: "checks" };
    case "release_submitted":
      return { label: "Releasing payment", variant: "progress", icon: "clock" };
    case "released":
      return { label: "Released", variant: "muted", icon: "checks" };
    default:
      return null;
  }
}

export function MilestoneEngagementTimeline({
  milestones,
  assetSymbol,
  assetDecimals,
  isProvider,
  isRequester,
  paymentFunded,
  onSubmitClick,
  onReviewClick,
  onReleaseClick,
  releaseBusyId,
  releasableMilestoneId,
  nextReleasePosition,
}: Props) {
  if (milestones.length === 0) {
    return null;
  }

  return (
    <div className="milestone-plan milestone-plan--compact milestone-plan--engagement">
      <ol
        className="milestone-plan__timeline"
        aria-label="Milestone schedule"
      >
        {milestones.map((m, index) => {
          const amountHuman = formatBudgetSmallestUnits(
            m.amountSmallest,
            assetDecimals,
          );
          const dotVariant = milestoneDotVariant(m.status);
          const isLast = index === milestones.length - 1;
          const badge = statusBadge(m.status, isProvider);
          const showSubmit =
            isProvider && milestoneCanProviderSubmit(m.status, paymentFunded);
          const showReview = isRequester && m.status === "pending_review";
          const showRelease =
            isRequester &&
            m.status === "release_eligible" &&
            m.id === releasableMilestoneId;
          const waitingForPriorRelease =
            isRequester &&
            (m.status === "release_eligible" ||
              m.status === "release_submitted") &&
            m.id !== releasableMilestoneId &&
            m.position > nextReleasePosition;

          return (
            <li
              key={m.id}
              className={`milestone-plan__step milestone-plan__step--${dotVariant}${
                isLast ? " milestone-plan__step--last" : ""
              }`}
            >
              <span className="milestone-plan__rail" aria-hidden>
                <span
                  className={`milestone-plan__dot milestone-plan__dot--${dotVariant}`}
                >
                  {m.position}
                </span>
                {!isLast ? <span className="milestone-plan__line" /> : null}
              </span>
              <article className="milestone-plan__body">
                <div className="milestone-plan__row">
                  <h5 className="milestone-plan__title">{m.title}</h5>
                  <span className="milestone-plan__amount">
                    {amountHuman}{" "}
                    <span className="milestone-plan__amount-symbol">
                      {assetSymbol}
                    </span>
                  </span>
                </div>
                {m.description.trim() ? (
                  <p className="milestone-plan__description">{m.description}</p>
                ) : null}
                {waitingForPriorRelease ? (
                  <p className="milestone-plan__step-hint">
                    Release milestone {nextReleasePosition} first
                  </p>
                ) : null}
                {badge && showRelease ? (
                  <div className="milestone-plan__step-inline">
                    <p
                      className={`milestone-plan__status-badge milestone-plan__status-badge--${badge.variant}`}
                    >
                      {badge.icon ? (
                        <FigmaIcon name={badge.icon} size={13} aria-hidden />
                      ) : null}
                      <span>{badge.label}</span>
                    </p>
                    <button
                      type="button"
                      className="primary compact"
                      disabled={releaseBusyId === m.id}
                      onClick={() => onReleaseClick(m.id)}
                    >
                      {releaseBusyId === m.id
                        ? "Releasing…"
                        : "Release payment"}
                    </button>
                  </div>
                ) : badge ? (
                  <p
                    className={`milestone-plan__status-badge milestone-plan__status-badge--${badge.variant}`}
                  >
                    {badge.icon ? (
                      <FigmaIcon name={badge.icon} size={13} aria-hidden />
                    ) : null}
                    <span>{badge.label}</span>
                  </p>
                ) : null}
                {showSubmit || showReview ? (
                  <div className="milestone-plan__step-actions">
                    {showSubmit ? (
                      <button
                        type="button"
                        className="primary compact"
                        onClick={() => onSubmitClick(m)}
                      >
                        Submit
                      </button>
                    ) : null}
                    {showReview ? (
                      <button
                        type="button"
                        className="primary compact"
                        onClick={() => onReviewClick(m)}
                      >
                        Review
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </article>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
