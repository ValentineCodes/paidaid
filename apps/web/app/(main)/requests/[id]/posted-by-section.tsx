import Link from "next/link";

import { DismissDrawerLink } from "../../../../components/dismiss-drawer-link";
import { FigmaIcon } from "../../../../components/figma-icons";

function initialsFromDisplayName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase() || "?";
}

type Props = {
  displayName: string;
  verified: boolean;
  avatarUrl: string | null;
  variant: "drawer" | "page";
};

function RequesterAvatar({
  displayName,
  avatarUrl,
}: {
  displayName: string;
  avatarUrl: string | null;
}) {
  const initials = initialsFromDisplayName(displayName);
  return (
    <div className="avatar large shrink-0">
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl}
          alt=""
          className="size-full rounded-full object-cover"
        />
      ) : (
        initials
      )}
    </div>
  );
}

export function PostedBySection({
  displayName,
  verified,
  avatarUrl,
  variant,
}: Props) {
  const inner = (
    <>
      <h4 id="posted-by-heading">Posted by</h4>
      <div className="requester">
        <RequesterAvatar displayName={displayName} avatarUrl={avatarUrl} />
        <div>
          <strong>{displayName}</strong>
          <span>
            <FigmaIcon name="star" size={14} /> Member on PaidAid
          </span>
        </div>
        {verified ? (
          <span className="verified">
            <FigmaIcon name="check" size={12} /> Verified
          </span>
        ) : null}
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-[var(--muted)]">
        Only a display name is shown on listings.{" "}
        <DismissDrawerLink
          href="/account"
          className="font-semibold text-[var(--ink)] underline"
        >
          Edit your profile
        </DismissDrawerLink>
      </p>
    </>
  );

  if (variant === "drawer") {
    return (
      <div className="detail-section" aria-labelledby="posted-by-heading">
        {inner}
      </div>
    );
  }

  return (
    <section
      className="flex flex-col gap-3 border-t border-stone-200 pt-6 dark:border-stone-800"
      aria-labelledby="posted-by-heading-page"
    >
      <h2
        id="posted-by-heading-page"
        className="text-lg font-medium text-stone-900 dark:text-stone-100"
      >
        Posted by
      </h2>
      <div className="requester max-w-lg rounded-xl border border-stone-200 bg-stone-50 p-4 dark:border-stone-700 dark:bg-stone-900/40">
        <RequesterAvatar displayName={displayName} avatarUrl={avatarUrl} />
        <div>
          <strong className="text-stone-900 dark:text-stone-100">
            {displayName}
          </strong>
          <span className="text-stone-500 dark:text-stone-400">
            <FigmaIcon name="star" size={14} /> Member on PaidAid
          </span>
        </div>
        {verified ? (
          <span className="verified">
            <FigmaIcon name="check" size={12} /> Verified
          </span>
        ) : null}
      </div>
      <p className="text-sm text-stone-500 dark:text-stone-400">
        Only a display name is shown on listings.{" "}
        <Link href="/account" className="font-medium text-stone-900 underline dark:text-stone-100">
          Edit your profile
        </Link>
      </p>
    </section>
  );
}
