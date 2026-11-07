"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "../../../lib/supabase/server";
import {
  HEADLINE_MAX,
  MESSAGE_MAX,
  proposedHumanToSmallestUnitsOrThrow,
} from "../../../lib/validation/response";

export type SubmitResponseState = {
  error: string | null;
  fieldErrors?: Partial<
    Record<"message" | "headline" | "proposedHuman", string>
  >;
  success?: boolean;
  responseId?: string;
};

export type WithdrawResponseState = {
  error: string | null;
  success?: boolean;
};

export type AcceptResponseState = {
  error: string | null;
  success?: boolean;
};

export async function submitRequestResponse(
  _prev: SubmitResponseState,
  formData: FormData,
): Promise<SubmitResponseState> {
  const requestId = String(formData.get("request_id") ?? "");
  const message = String(formData.get("message") ?? "");
  const headline = String(formData.get("headline") ?? "");
  const proposedHuman = String(formData.get("proposed_human") ?? "");

  if (!requestId) {
    return { error: "Missing request" };
  }

  const fieldErrors: SubmitResponseState["fieldErrors"] = {};
  if (message.trim().length > 0 && message.length > MESSAGE_MAX) {
    fieldErrors.message = `Message must be at most ${MESSAGE_MAX} characters`;
  }
  if (headline.trim().length > HEADLINE_MAX) {
    fieldErrors.headline = `Headline must be at most ${HEADLINE_MAX} characters`;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "You must be signed in to respond." };
  }

  // Open listings only — `requests` RLS allows select for owners (and assigned
  // providers), so responders must not query that table for preflight.
  const { data: openRequest, error: openErr } = await supabase
    .from("requests_public")
    .select("id, budget_asset_id")
    .eq("id", requestId)
    .maybeSingle();

  if (openErr || !openRequest?.budget_asset_id) {
    return {
      error:
        openErr?.message ??
        "This request is not open for offers (or it was removed).",
    };
  }

  const budgetAssetId = openRequest.budget_asset_id;

  const { data: ownRow } = await supabase
    .from("requests")
    .select("requester_id")
    .eq("id", requestId)
    .maybeSingle();
  if (ownRow?.requester_id === user.id) {
    return { error: "You cannot respond to your own request." };
  }

  const { data: asset, error: assetErr } = await supabase
    .from("assets")
    .select("id, symbol, decimals")
    .eq("id", budgetAssetId)
    .maybeSingle();

  if (assetErr || !asset) {
    return { error: "Could not load request asset." };
  }

  let smallestUnits = "";
  try {
    smallestUnits = proposedHumanToSmallestUnitsOrThrow(proposedHuman, asset);
  } catch (e) {
    fieldErrors.proposedHuman =
      e instanceof Error ? e.message : "Invalid proposed amount";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { error: null, fieldErrors };
  }

  const { data: responseId, error: rpcError } = await supabase.rpc(
    "submit_request_response",
    {
      p_request_id: requestId,
      p_message: message.trim(),
      p_proposed_amount: smallestUnits as unknown as number,
      p_headline: headline.trim(),
    },
  );

  if (rpcError || !responseId) {
    return { error: rpcError?.message ?? "Could not submit response" };
  }

  revalidatePath(`/requests/${requestId}`);
  revalidatePath("/responses/mine");
  return {
    error: null,
    success: true,
    responseId: responseId as string,
  };
}

export async function withdrawRequestResponse(
  _prev: WithdrawResponseState,
  formData: FormData,
): Promise<WithdrawResponseState> {
  const responseId = String(formData.get("response_id") ?? "");
  const requestId = String(formData.get("request_id") ?? "");

  if (!responseId || !requestId) {
    return { error: "Missing response" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "You must be signed in." };
  }

  const { error: rpcError } = await supabase.rpc("withdraw_request_response", {
    p_response_id: responseId,
  });

  if (rpcError) {
    return { error: rpcError.message };
  }

  revalidatePath(`/requests/${requestId}`);
  revalidatePath("/responses/mine");
  return { error: null, success: true };
}

export async function acceptRequestResponse(
  _prev: AcceptResponseState,
  formData: FormData,
): Promise<AcceptResponseState> {
  const requestId = String(formData.get("request_id") ?? "");
  const responseId = String(formData.get("response_id") ?? "");

  if (!requestId || !responseId) {
    return { error: "Missing request or response" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "You must be signed in." };
  }

  return {
    error:
      "Direct accept is disabled. Use “Accept and fund escrow” to fund on-chain first.",
  };
}

export async function confirmLiveProfilePhoto(
  storagePath: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const t = storagePath.trim();
  if (!t) {
    return { ok: false, error: "Missing storage path" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Not signed in" };
  }
  const prefix = `${user.id}/`;
  if (!t.startsWith(prefix)) {
    return { ok: false, error: "Invalid path" };
  }

  const { error } = await supabase.rpc("confirm_live_profile_photo", {
    p_storage_path: t,
  });
  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/account");
  revalidatePath("/account/edit");
  revalidatePath("/", "layout");
  revalidatePath("/messages", "layout");
  revalidatePath("/requests", "layout");
  revalidatePath("/notifications", "layout");
  return { ok: true };
}
