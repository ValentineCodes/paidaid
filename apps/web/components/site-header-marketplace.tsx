"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { PaidAidLogo } from "./paidaid-logo";
import { ThemeToggle } from "./theme-toggle";
import { MarketplaceWalletControl } from "./marketplace-wallet-control";

type SiteHeaderMarketplaceProps = {
  user: {
    email: string;
    id: string;
    displayName: string;
    avatarUrl: string | null;
    avatarKey: string;
  } | null;
  linkedNearAccountId: string | null;
  unreadNotifications?: number;
};

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
  linkedNearAccountId,
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
          <MarketplaceWalletControl
            hasSession={Boolean(user)}
            sessionNearAccountId={linkedNearAccountId}
          />
        </div>
      </div>
    </header>
  );
}
