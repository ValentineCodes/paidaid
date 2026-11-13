"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import {
  reviewResponseMilestoneProposal,
  type ReviewMilestoneProposalState,
} from "../response-actions";

const initial: ReviewMilestoneProposalState = { error: null };

type Props = {
  requestId: string;
  responseId: string;
};

export function MilestoneReviewForm({ requestId, responseId }: Props) {
  const router = useRouter();
  const [state, formAction] = useActionState(
    reviewResponseMilestoneProposal,
    initial,
  );

  useEffect(() => {
    if (state.success) {
      router.refresh();
    }
  }, [state.success, router]);

  return (
    <div role="region" aria-label="Review milestone proposal">
      {state.error ? (
        <p className="offer-form-card__error" role="alert">
          {state.error}
        </p>
      ) : null}
      <div className="request-response-card__actions">
        <form action={formAction}>
          <input type="hidden" name="request_id" value={requestId} />
          <input type="hidden" name="response_id" value={responseId} />
          <input type="hidden" name="review_action" value="approve" />
          <button type="submit" className="primary compact">
            Approve milestones
          </button>
        </form>
        <form action={formAction}>
          <input type="hidden" name="request_id" value={requestId} />
          <input type="hidden" name="response_id" value={responseId} />
          <input type="hidden" name="review_action" value="reject" />
          <button type="submit" className="secondary compact">
            Decline proposal
          </button>
        </form>
      </div>
    </div>
  );
}
