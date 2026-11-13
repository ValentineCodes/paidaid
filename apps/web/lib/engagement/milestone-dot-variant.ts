import type { Database } from "../database.types";

type Status = Database["public"]["Enums"]["milestone_workflow_status"];

export type MilestoneDotVariant = "locked" | "active" | "pending" | "approved";

export function milestoneDotVariant(status: Status): MilestoneDotVariant {
  if (
    status === "release_eligible" ||
    status === "release_submitted" ||
    status === "released"
  ) {
    return "approved";
  }
  if (status === "pending_review") {
    return "pending";
  }
  if (status === "active") {
    return "active";
  }
  return "locked";
}

export function milestoneCanProviderSubmit(
  status: Status,
  paymentFunded: boolean,
): boolean {
  return paymentFunded && status === "active";
}
