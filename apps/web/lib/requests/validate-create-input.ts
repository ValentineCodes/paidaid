import type { Tables } from "../database.types";
import {
  humanAmountToSmallestUnits,
  parseDigitsIntegerString,
  validateRequestComposer,
  type RequestComposerValues,
} from "../validation/request";

export type CreateRequestValidationResult = {
  error: string | null;
  fieldErrors?: Record<string, string>;
};

/** Shared rules for the create-request form (used by server action and unit tests). */
export function validateCreateRequestFormForTests(input: {
  values: RequestComposerValues;
  assets: Tables<"assets">[];
  photoFiles: { size: number; type: string }[];
}): CreateRequestValidationResult {
  const { fieldErrors } = validateRequestComposer(input.values, input.assets, {
    photoFiles: input.photoFiles,
  });
  if (fieldErrors) {
    return { error: null, fieldErrors };
  }
  const asset = input.assets.find((a) => a.id === input.values.budgetAssetId);
  if (!asset) {
    return {
      error: null,
      fieldErrors: { budgetAssetId: "Select a supported asset" },
    };
  }
  const converted = humanAmountToSmallestUnits(
    input.values.budgetHuman,
    asset.decimals,
  );
  if (!converted.ok) {
    return { error: null, fieldErrors: { budgetHuman: converted.error } };
  }
  const digits = parseDigitsIntegerString(converted.smallestUnits);
  if (!digits || digits === "0") {
    return {
      error: null,
      fieldErrors: { budgetHuman: "Budget must be positive" },
    };
  }
  return { error: null };
}
