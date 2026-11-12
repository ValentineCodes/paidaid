"use client";

import Link from "next/link";

export type HeaderProfileLinkUser = {
  displayName: string;
  avatarUrl: string | null;
  avatarKey: string;
};

function profileInitials(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  }
  if (parts[0]) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return "PA";
}

export function HeaderProfileLink({ user }: { user: HeaderProfileLinkUser }) {
  const initials = profileInitials(user.displayName);

  return (
    <Link
      href="/account"
      className="avatar small header-profile-link"
      title={user.displayName || "Your profile"}
      aria-label="Profile and settings"
    >
      {user.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- signed URL from storage
        <img
          key={user.avatarKey}
          src={user.avatarUrl}
          alt=""
          width={34}
          height={34}
        />
      ) : (
        initials
      )}
    </Link>
  );
}
