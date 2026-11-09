import Link from "next/link";

import { CopyableNearAddress } from "../../../components/copyable-near-address";
import type { Tables } from "../../../lib/database.types";
import { formatReviewAgo } from "../../../lib/datetime/relative-from-now";

type ReviewRow = {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  requester_id: string;
};

type Props = {
  nowMs: number;
  profile: Tables<"profiles">;
  /** Signed URL or external avatar — prefer uploaded file over stale `avatar_url` in parent. */
  photoDisplayUrl: string | null;
  nearAccountId: string | null;
  reviews: ReviewRow[];
  requesterNames: Map<string, string>;
  avgRating: number | null;
  reviewCount: number;
  taskCount: number;
};

function displayInitials(displayName: string) {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  }
  return displayName.slice(0, 2).toUpperCase() || "?";
}

function peerInitials(name: string) {
  return displayInitials(name);
}

export function ProfileShell({
  nowMs,
  profile,
  photoDisplayUrl,
  nearAccountId,
  reviews,
  requesterNames,
  avgRating,
  reviewCount,
  taskCount,
}: Props) {
  const initials = displayInitials(profile.display_name);
  const avatarSrc = photoDisplayUrl?.trim() ?? "";
  const ratingLabel = avgRating !== null ? avgRating.toFixed(1) : "—";

  return (
    <main className="inner-page">
      <div className="page-heading">
        <span>YOUR IDENTITY</span>
        <h1>Profile</h1>
        <p>One reputation for every way you participate.</p>
      </div>

      <div className="profile-grid">
        <div className="profile-card">
          <div className="profile-avatar">
            {avatarSrc ? (
              // eslint-disable-next-line @next/next/no-img-element -- external URLs
              <img
                src={avatarSrc}
                alt=""
                className="size-full rounded-full object-cover"
              />
            ) : (
              initials
            )}
          </div>
          <h2>{profile.display_name}</h2>
          {profile.bio?.trim() ? <p>{profile.bio.trim()}</p> : null}
          {nearAccountId ? (
            <CopyableNearAddress accountId={nearAccountId} />
          ) : null}
          <div className="profile-stats">
            <span>
              <strong>{ratingLabel}</strong>
              <small>Rating</small>
            </span>
            <span>
              <strong>{reviewCount}</strong>
              <small>Reviews</small>
            </span>
            <span>
              <strong>{taskCount}</strong>
              <small>Tasks</small>
            </span>
          </div>
          <Link href="/account/edit" className="profile-edit-link">
            Edit profile
          </Link>
        </div>

        <div className="reputation">
          <div className="reputation-head">
            <div>
              <span>REPUTATION</span>
              <h3>What people say</h3>
            </div>
            <div>
              <svg
                width={18}
                height={18}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                aria-hidden
              >
                <path d="m12 2 3 6 7 .9-5 4.8 1.3 6.8-6.3-3.3-6.3 3.3L7 13.7 2 8.9 9 8Z" />
              </svg>{" "}
              {avgRating !== null ? avgRating.toFixed(1) : "—"}
            </div>
          </div>
          {reviews.length === 0 ? (
            <p className="py-8 text-sm text-[var(--muted)]">
              No reviews yet. Complete work and ask requesters to leave feedback.
            </p>
          ) : (
            reviews.map((r, i) => {
              const name =
                requesterNames.get(r.requester_id) ?? "Community member";
              const initialsPeer = peerInitials(name);
              const tone = i % 2 === 0 ? "blue" : "coral";
              return (
                <blockquote key={r.id}>
                  “{r.comment?.trim() || `${r.rating}-star review`}”
                  <footer>
                    <div className={`avatar small ${tone}`}>{initialsPeer}</div>
                    <span>
                      <strong>{name}</strong>
                      <small>
                        Task requester · {formatReviewAgo(r.created_at, nowMs)}
                      </small>
                    </span>
                  </footer>
                </blockquote>
              );
            })
          )}
        </div>
      </div>
    </main>
  );
}
