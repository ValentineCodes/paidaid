import { FigmaIcon } from "./figma-icons";

export function ProfileReviewRating({ rating }: { rating: number }) {
  const value = Math.min(5, Math.max(1, Math.round(rating)));

  return (
    <span
      className="profile-review-stars"
      role="img"
      aria-label={`${value} out of 5 stars`}
    >
      <FigmaIcon name="star" size={16} />
      <span aria-hidden>{value}</span>
    </span>
  );
}
