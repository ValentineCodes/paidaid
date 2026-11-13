import type { ComponentProps, ElementType } from "react";

import { FigmaIcon } from "./figma-icons";

type PreAcceptChatLinkProps = {
  href: string;
  hasUnread: boolean;
  "aria-label": string;
  as?: ElementType;
} & Omit<ComponentProps<"a">, "href" | "children" | "aria-label">;

export function PreAcceptChatLink({
  href,
  hasUnread,
  "aria-label": ariaLabel,
  as: LinkComponent = "a",
  className = "",
  ...rest
}: PreAcceptChatLinkProps) {
  const classes = [
    "engagement-person-card__chat",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const iconClasses = [
    "engagement-connect-icon",
    hasUnread ? "engagement-connect-icon--unread" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <LinkComponent
      href={href}
      className={classes}
      aria-label={ariaLabel}
      {...rest}
    >
      <span className={iconClasses} aria-hidden>
        <FigmaIcon name="message" size={20} />
      </span>
    </LinkComponent>
  );
}
