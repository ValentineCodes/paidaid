import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../database.types";
import type { MilestoneDisplayRow } from "./milestone-schedule";

export async function loadRequestMilestoneDisplayRows(
  supabase: SupabaseClient<Database>,
  requestId: string,
): Promise<MilestoneDisplayRow[]> {
  const { data, error } = await supabase
    .from("request_milestones")
    .select("position, title, description, amount")
    .eq("request_id", requestId)
    .order("position");

  if (error || !data?.length) {
    return [];
  }

  return data.map((m) => ({
    position: m.position,
    title: m.title,
    description: m.description ?? "",
    amountSmallest: String(m.amount),
  }));
}

export async function loadResponseMilestoneProposals(
  supabase: SupabaseClient<Database>,
  responseId: string,
): Promise<MilestoneDisplayRow[]> {
  const { data, error } = await supabase
    .from("request_response_milestone_proposals")
    .select("position, title, description, amount")
    .eq("response_id", responseId)
    .order("position");

  if (error || !data?.length) {
    return [];
  }

  return data.map((m) => ({
    position: m.position,
    title: m.title,
    description: m.description ?? "",
    amountSmallest: String(m.amount),
  }));
}
