import Image from "next/image";
import Link from "next/link";

import { PROTOCOL_NAME } from "@paidaid/shared";

/** Crown glyph (transparent); full square mark for favicon is `/logo.png`. */
const CROWN_MARK_SRC = "/crown-mark.png";

type PaidAidLogoProps = {
  /** When set, render only the mark (no wordmark link). */
  markOnly?: boolean;
  className?: string;
};

export function PaidAidLogo({ markOnly = false, className }: PaidAidLogoProps) {
  const mark = (
    <span className={`logo-mark${className ? ` ${className}` : ""}`}>
      <Image
        src={CROWN_MARK_SRC}
        alt=""
        width={32}
        height={32}
        sizes="32px"
        priority
      />
    </span>
  );

  if (markOnly) {
    return mark;
  }

  return (
    <Link href="/" className="logo">
      {mark}
      <span>{PROTOCOL_NAME}</span>
    </Link>
  );
}

export function PaidAidLogoMark(props: Omit<PaidAidLogoProps, "markOnly">) {
  return <PaidAidLogo markOnly {...props} />;
}
