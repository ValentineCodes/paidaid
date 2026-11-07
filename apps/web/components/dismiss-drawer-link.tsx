"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ComponentProps } from "react";

type Props = ComponentProps<typeof Link>;

/** Navigate away from an intercepted request drawer without leaving modal history. */
export function DismissDrawerLink({
  href,
  onClick,
  replace = true,
  ...rest
}: Props) {
  const router = useRouter();

  return (
    <Link
      href={href}
      replace={replace}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented) {
          return;
        }
        const target =
          typeof href === "string"
            ? href
            : typeof href === "object" && "pathname" in href
              ? (href.pathname ?? "")
              : "";
        if (!target) {
          return;
        }
        e.preventDefault();
        if (replace) {
          router.replace(target);
        } else {
          router.push(target);
        }
      }}
      {...rest}
    />
  );
}
