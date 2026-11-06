import Link from "next/link";
import { PROTOCOL_NAME } from "@paidaid/shared";

export function PaidAidLogo() {
  return (
    <Link href="/" className="logo">
      <span className="logo-mark">
        <span />
      </span>
      <span>{PROTOCOL_NAME}</span>
    </Link>
  );
}
