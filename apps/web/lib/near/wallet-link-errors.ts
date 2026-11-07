export function formatWalletLinkError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("near account already linked")) {
    return (
      "This NEAR account is already linked to another PaidAid user. " +
      "Disconnect, connect a different NEAR account in Intear, then try again."
    );
  }
  if (lower.includes("wallet already linked")) {
    return "Your PaidAid account already has a linked wallet. Unlink it first to switch.";
  }
  return message;
}

export type NearAccountLinkStatus =
  | "free"
  | "linked_to_you"
  | "linked_to_other"
  | "you_already_linked"
  | "invalid_account"
  | "not_authenticated"
  | string;

export function describeNearAccountLinkStatus(
  status: NearAccountLinkStatus,
  nearAccountId: string,
): string | null {
  switch (status) {
    case "free":
      return null;
    case "linked_to_other":
      return `“${nearAccountId}” is linked to a different PaidAid account. Disconnect, pick another NEAR account in Intear, then Sign & link.`;
    case "you_already_linked":
      return "You already have a linked wallet on this PaidAid account. Unlink first if you need to change it.";
    case "linked_to_you":
      return null;
    default:
      return null;
  }
}
