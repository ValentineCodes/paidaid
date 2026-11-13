"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "../../../lib/supabase/server";

export type MilestoneActionState = {
  error: string | null;
  success?: boolean;
};

export async function submitMilestoneDelivery(
  _prev: MilestoneActionState,
  formData: FormData,
): Promise<MilestoneActionState> {
  const milestoneId = String(formData.get("milestone_id") ?? "");
  const description = String(formData.get("description") ?? "");
  const engagementId = String(formData.get("engagement_id") ?? "");

  if (!milestoneId || !engagementId) {
    return { error: "Missing milestone." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Sign in required." };
  }

  const { error } = await supabase.rpc("submit_milestone_delivery", {
    p_milestone_id: milestoneId,
    p_description: description.trim(),
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/engagements/${engagementId}`);
  return { error: null, success: true };
}

export async function reviewMilestoneDelivery(
  _prev: MilestoneActionState,
  formData: FormData,
): Promise<MilestoneActionState> {
  const milestoneId = String(formData.get("milestone_id") ?? "");
  const engagementId = String(formData.get("engagement_id") ?? "");
  const action = String(formData.get("review_action") ?? "");

  if (!milestoneId || !engagementId) {
    return { error: "Missing milestone." };
  }
  if (action !== "approve" && action !== "reject") {
    return { error: "Invalid action." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Sign in required." };
  }

  const { error } = await supabase.rpc("review_milestone_delivery", {
    p_milestone_id: milestoneId,
    p_action: action,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/engagements/${engagementId}`);
  return { error: null, success: true };
}
