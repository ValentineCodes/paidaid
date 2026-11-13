import Link from "next/link";

import type { HeroActiveRequest } from "../../lib/home/load-hero-active-request";

export function HomeHeroEyebrow({ active }: { active: HeroActiveRequest | null }) {
  if (active) {
    return (
      <Link href={active.href} className="eyebrow eyebrow--link">
        <span />
        <span className="eyebrow__label">{active.title}</span>
      </Link>
    );
  }

  return (
    <div className="eyebrow">
      <span /> Open marketplace · Built for people
    </div>
  );
}
