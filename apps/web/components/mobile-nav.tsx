"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  href: string;
  label: string;
  icon: "home" | "activity" | "message" | "bell";
  /** Red dot when user has unread (handled for notifications only). */
  showDot?: boolean;
};

const items: NavItem[] = [
  { href: "/", label: "Discover", icon: "home" },
  { href: "/activity", label: "Activity", icon: "activity" },
  { href: "/messages", label: "Messages", icon: "message" },
  {
    href: "/notifications",
    label: "Updates",
    icon: "bell",
    showDot: true,
  },
];

function Icon({ name }: { name: NavItem["icon"] }) {
  const common = {
    width: 20,
    height: 20,
    viewBox: "0 0 24 24",
    fill: "none" as const,
    stroke: "currentColor" as const,
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };
  switch (name) {
    case "home":
      return (
        <svg {...common}>
          <path d="m3 11 9-8 9 8" />
          <path d="M5 10v11h14V10M9 21v-7h6v7" />
        </svg>
      );
    case "activity":
      return (
        <svg {...common}>
          <path d="M4 19V9M10 19V5M16 19v-7M22 19V3" />
        </svg>
      );
    case "message":
      return (
        <svg {...common}>
          <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z" />
        </svg>
      );
    case "bell":
      return (
        <svg {...common}>
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
          <path d="M10 21h4" />
        </svg>
      );
    default:
      return null;
  }
}

function isActive(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/" || pathname === "";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function MobileNav({
  unreadNotifications,
}: {
  unreadNotifications: number;
}) {
  const pathname = usePathname() ?? "";

  return (
    <nav className="mobile-nav lg:hidden" aria-label="Primary">
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={active ? "active" : undefined}
          >
            <span>
              <Icon name={item.icon} />
              {item.showDot && unreadNotifications > 0 ? <i /> : null}
            </span>
            <small>{item.label}</small>
          </Link>
        );
      })}
    </nav>
  );
}
