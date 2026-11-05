import Link from "next/link";

export const mainNavItems = [
  { href: "/", label: "Home" },
  { href: "/contract", label: "Contract" },
] as const;

export function SiteNav() {
  return (
    <nav aria-label="Main">
      <ul className="flex flex-wrap gap-4 text-sm font-medium text-stone-600 sm:gap-6 dark:text-stone-400">
        {mainNavItems.map((item) => (
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
