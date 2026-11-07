import Link from "next/link";

export const mainSiteNavItems = [
  { href: "/", label: "Marketplace" },
  { href: "/requests/mine", label: "My requests" },
  { href: "/responses/mine", label: "My responses" },
  { href: "/notifications", label: "Notifications" },
  { href: "/engagements", label: "Engagements" },
  { href: "/contract", label: "Contract" },
] as const;

export function SiteNavMain() {
  return (
    <nav aria-label="Main">
      <ul className="flex flex-wrap gap-4 text-sm font-medium text-stone-600 sm:gap-6 dark:text-stone-400">
        {mainSiteNavItems.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className="transition hover:text-stone-900 dark:hover:text-stone-100"
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
