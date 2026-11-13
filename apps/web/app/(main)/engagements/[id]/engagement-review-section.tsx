"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { AppToast } from "../../../../components/app-toast";
import { FigmaIcon } from "../../../../components/figma-icons";
import { createClient } from "../../../../lib/supabase/client";
import type { Database } from "../../../../lib/database.types";

type ReviewRow = Database["public"]["Tables"]["reviews"]["Row"];

const STAR_RATING_LABELS = [
  "Poor",
  "Fair",
  "Good",
  "Great",
  "Excellent",
] as const;

function EngagementStarRating({
  value,
  onChange,
  disabled,
  readOnly,
}: {
  value: number;
  onChange?: (rating: number) => void;
  disabled?: boolean;
  readOnly?: boolean;
}) {
  const stars = (
    <>
      {[1, 2, 3, 4, 5].map((n) => {
        const on = n <= value;
        const starClass = on
          ? "engagement-star-rating__star engagement-star-rating__star--on"
          : "engagement-star-rating__star";
        if (readOnly) {
          return (
            <span key={n} className={starClass} aria-hidden={!on}>
              <FigmaIcon name="star" size={20} />
            </span>
          );
        }
        return (
          <button
            key={n}
            type="button"
            className={starClass}
            disabled={disabled}
            aria-label={`${n} star${n === 1 ? "" : "s"}`}
            aria-pressed={value === n}
            onClick={() => onChange?.(n)}
          >
            <FigmaIcon name="star" size={20} />
          </button>
        );
      })}
    </>
  );

  return (
    <div
      className={
        readOnly
          ? "engagement-star-rating engagement-star-rating--readonly"
          : "engagement-star-rating"
      }
    >
      <div
        className="engagement-star-rating__row"
        role={readOnly ? "img" : "group"}
        aria-label={
          readOnly ? `${value} out of 5 stars` : "Rate from 1 to 5 stars"
        }
      >
        {stars}
      </div>
      {!readOnly ? (
        <p className="engagement-star-rating__hint" aria-live="polite">
          {STAR_RATING_LABELS[value - 1] ?? "—"}
        </p>
      ) : null}
    </div>
  );
}

type Props = {
  engagementId: string;
  engagementStatus: Database["public"]["Enums"]["engagement_status"];
  isRequester: boolean;
  existingReview: ReviewRow | null;
};

export function EngagementReviewSection({
  engagementId,
  engagementStatus,
  isRequester,
  existingReview,
}: Props) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successToastOpen, setSuccessToastOpen] = useState(false);

  async function runSubmitReview() {
    setBusy(true);
    setError(null);
    const { error: rpcErr } = await supabase.rpc("submit_review", {
      p_engagement_id: engagementId,
      p_rating: rating,
      p_comment: comment.trim() || undefined,
    });
    if (rpcErr) {
      setError(rpcErr.message);
      setBusy(false);
      return;
    }
    setBusy(false);
    setSuccessToastOpen(true);
    router.refresh();
  }

  if (engagementStatus !== "completed" && !existingReview) {
    return null;
  }

  return (
    <>
      <AppToast
        message="Thanks — your review was submitted."
        visible={successToastOpen}
        onClose={() => setSuccessToastOpen(false)}
        variant="success"
      />
      {engagementStatus === "completed" && isRequester && !existingReview ? (
        <section className="engagement-delivery-card engagement-review-card">
          <p className="engagement-delivery-card__eyebrow">Feedback</p>
          <h3>Rate your provider</h3>
          <p className="engagement-delivery-card__lead">
            How did the work go? Your rating helps others choose with confidence.
          </p>
          <EngagementStarRating
            value={rating}
            onChange={setRating}
            disabled={busy}
          />
          <div className="form-fields engagement-review-card__form">
            <label htmlFor="review_comment">
              Comment
              <textarea
                id="review_comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={4}
                maxLength={2000}
                placeholder="What stood out? Optional."
                disabled={busy}
              />
            </label>
            {error ? (
              <p className="engagement-workflow-error" role="alert">
                {error}
              </p>
            ) : null}
            <button
              type="button"
              disabled={busy || rating < 1 || rating > 5}
              onClick={() => void runSubmitReview()}
              className="primary-wide"
            >
              {busy ? "Submitting…" : "Submit review"}
              {!busy ? <FigmaIcon name="star" size={17} /> : null}
            </button>
          </div>
        </section>
      ) : null}
      {existingReview ? (
        <section className="engagement-delivery-card engagement-review-card engagement-review-card--submitted">
          <p className="engagement-delivery-card__eyebrow">Your review</p>
          <h3>Thanks for the feedback</h3>
          <EngagementStarRating value={existingReview.rating} readOnly />
          {existingReview.comment?.trim() ? (
            <p className="engagement-review-card__comment">
              {existingReview.comment}
            </p>
          ) : (
            <p className="engagement-review-card__meta">No written comment.</p>
          )}
        </section>
      ) : null}
    </>
  );
}
