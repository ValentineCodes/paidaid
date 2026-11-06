"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { PaidAidLogo } from "./paidaid-logo";
import { SignOutForm } from "./sign-out-form";
import { ThemeToggle } from "./theme-toggle";

type SiteHeaderMarketplaceProps = {
  user: { email: string; id: string } | null;
  unreadNotifications?: number;
};

function initials(email: string) {
  const local = email.split("@")[0] ?? "?";
  const parts = local.split(/[.\s_-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  }
  return local.slice(0, 2).toUpperCase() || "?";
}

function DesktopNavLink({
  href,
  children,
  badge,
}: {
  href: string;
  children: React.ReactNode;
  badge?: number;
}) {
  const pathname = usePathname() ?? "";
  const active =
    href === "/"
      ? pathname === "/" || pathname === ""
      : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link href={href} className={active ? "active" : undefined}>
      {children}
      {href === "/notifications" && (badge ?? 0) > 0 ? <i /> : null}
    </Link>
  );
}

export function SiteHeaderMarketplace({
  user,
  unreadNotifications = 0,
}: SiteHeaderMarketplaceProps) {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <PaidAidLogo />
        <nav className="desktop-nav max-lg:hidden" aria-label="Main">
          <DesktopNavLink href="/">Discover</DesktopNavLink>
          <DesktopNavLink href="/requests/mine">Activity</DesktopNavLink>
          <DesktopNavLink href="/messages">Messages</DesktopNavLink>
          <DesktopNavLink href="/notifications" badge={unreadNotifications}>
            Updates
          </DesktopNavLink>
        </nav>
        <div className="header-actions">
          <ThemeToggle />
          {user ? (
            <>
              <Link href="/requests/new" className="create-button max-sm:text-[0]">
                <svg
                  width={18}
                  height={18}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  aria-hidden
                >
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Post a task
              </Link>
              <Link
                href="/account"
                className="avatar max-sm:hidden"
                aria-label="Open profile"
              >
                {initials(user.email)}
                <span />
              </Link>
              <div className="max-lg:hidden">
                <SignOutForm />
              </div>
            </>
          ) : (
            <>
              <Link
                href="/auth/login"
                className="hidden text-sm font-semibold text-[var(--muted)] hover:text-[var(--ink)] sm:inline"
              >
                Sign in
              </Link>
              <Link href="/auth/sign-up" className="create-button max-sm:text-[0]">
                <svg
                  width={18}
                  height={18}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  aria-hidden
                >
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Sign up
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
