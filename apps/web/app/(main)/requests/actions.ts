"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "../../../lib/supabase/server";
import { REQUEST_PHOTOS_BUCKET } from "../../../lib/constants/storage";
import {
  humanAmountToSmallestUnits,
  validateRequestComposer,
  type RequestComposerValues,
} from "../../../lib/validation/request";
import { validateCreateRequestFormForTests } from "../../../lib/requests/validate-create-input";
export type CreateRequestState = {
  error: string | null;
  fieldErrors?: Record<string, string>;
  success?: boolean;
  requestId?: string;
};

function parseIsoOrNull(v: string): string | null {
  const t = v.trim();
  if (t === "") {
    return null;
  }
  const d = Date.parse(t);
  if (Number.isNaN(d)) {
    return null;
  }
  return new Date(t).toISOString();
}

export async function createRequest(
  _prev: CreateRequestState,
  formData: FormData,
): Promise<CreateRequestState> {
  const title = String(formData.get("title") ?? "");
  const description = String(formData.get("description") ?? "");
  const timingType = String(formData.get("timing_type") ?? "") as
    "immediate" | "scheduled";
  const scheduledAt = String(formData.get("scheduled_at") ?? "");
  const deadlineAt = String(formData.get("deadline_at") ?? "");
  const expiresAt = String(formData.get("expires_at") ?? "");
  const locationKind = String(formData.get("location_kind") ?? "") as
    "unspecified" | "online" | "in_person";
  const locationLabel = String(formData.get("location_label") ?? "");
  const budgetHuman = String(formData.get("budget_human") ?? "");
  const budgetAssetId = String(formData.get("budget_asset_id") ?? "");
  const publishRaw = String(formData.get("publish") ?? "true");
  const publish = publishRaw === "true";

  const tagIds = formData
    .getAll("tag_id")
    .map((v) => String(v))
    .filter((id) => id.length > 0);

  const photos = formData
    .getAll("photos")
    .filter((f): f is File => f instanceof File && f.size > 0);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in to create a request." };
  }

  const { data: assets, error: assetsError } = await supabase
    .from("assets")
    .select("*")
    .order("canonical_asset_key");

  if (assetsError || !assets?.length) {
    return {
      error:
        assetsError?.message ??
        "Supported assets are not loaded. Check your database migration.",
    };
  }

  const values: RequestComposerValues = {
    title,
    description,
    timingType,
    scheduledAt,
    deadlineAt,
    expiresAt,
    locationKind,
    locationLabel,
    budgetHuman,
    budgetAssetId,
    tagIds,
  };

  const { fieldErrors: clientErrors } = validateRequestComposer(
    values,
    assets,
    {
      photoFiles: photos,
    },
  );
  if (clientErrors) {
    return { error: null, fieldErrors: clientErrors };
  }

  const asset = assets.find((a) => a.id === budgetAssetId);
  if (!asset) {
    return {
      error: null,
      fieldErrors: { budgetAssetId: "Select a supported asset" },
    };
  }

  const converted = humanAmountToSmallestUnits(budgetHuman, asset.decimals);
  if (!converted.ok) {
    return { error: null, fieldErrors: { budgetHuman: converted.error } };
  }

  const scheduledIso =
    timingType === "scheduled" ? parseIsoOrNull(scheduledAt) : null;
  if (timingType === "scheduled" && !scheduledIso) {
    return {
      error: null,
      fieldErrors: { scheduledAt: "Pick a valid date and time" },
    };
  }

  const deadlineIso = parseIsoOrNull(deadlineAt);
  const expiresIso = parseIsoOrNull(expiresAt);

  const rpcPayload = {
    p_title: title.trim(),
    p_description: description.trim(),
    p_timing_type: timingType,
    p_scheduled_at: scheduledIso,
    p_deadline_at: deadlineIso,
    p_expires_at: expiresIso,
    p_budget_amount: converted.smallestUnits,
    p_budget_asset_id: budgetAssetId,
    p_location_kind: locationKind,
    p_location_label:
      locationKind === "in_person" ? locationLabel.trim() : null,
    p_location_structured: null,
    p_tag_ids: [...new Set(tagIds)].length > 0 ? [...new Set(tagIds)] : null,
    p_publish: publish,
  };

  const { data: requestId, error: rpcError } = await supabase.rpc(
    "create_request",
    rpcPayload as never,
  );

  if (rpcError || !requestId) {
    return { error: rpcError?.message ?? "Could not create request" };
  }

  const requestIdStr = requestId as string;

  if (photos.length > 0) {
    const paths: string[] = [];
    const mimeTypes: string[] = [];
    const byteSizes: number[] = [];

    for (const file of photos) {
      const ext = extensionForMime(file.type);
      const objectName = `${user.id}/${requestIdStr}/${randomUUID()}.${ext}`;
      const { error: upError } = await supabase.storage
        .from(REQUEST_PHOTOS_BUCKET)
        .upload(objectName, file, {
          contentType: file.type,
          upsert: false,
        });

      if (upError) {
        return {
          error: `Photo upload failed: ${upError.message}`,
          requestId: requestIdStr,
        };
      }

      paths.push(objectName);
      mimeTypes.push(file.type);
      byteSizes.push(file.size);
    }

    const { error: photoRpcError } = await supabase.rpc("add_request_photos", {
      p_request_id: requestIdStr,
      p_paths: paths,
      p_mime_types: mimeTypes,
      p_byte_sizes: byteSizes,
    });

    if (photoRpcError) {
      return {
        error: `Saved the request but photos failed: ${photoRpcError.message}`,
        requestId: requestIdStr,
      };
    }
  }

  revalidatePath("/requests");
  revalidatePath(`/requests/${requestIdStr}`);
  redirect(`/requests/${requestIdStr}`);
}

function extensionForMime(mime: string): string {
  if (mime === "image/jpeg") {
    return "jpg";
  }
  if (mime === "image/png") {
    return "png";
  }
  if (mime === "image/webp") {
    return "webp";
  }
  if (mime === "image/gif") {
    return "gif";
  }
  return "bin";
}

export { validateCreateRequestFormForTests };
