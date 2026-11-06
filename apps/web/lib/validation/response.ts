import type { Tables } from "../database.types";

import {
  humanAmountToSmallestUnits,
  parseDigitsIntegerString,
  validateBudgetSmallestUnitsAgainstAsset,
} from "./request";

const MESSAGE_MAX = 2000;
const HEADLINE_MAX = 160;

export type ResponseOfferFieldErrors = Partial<
  Record<"message" | "headline" | "proposedHuman", string>
>;

export type ResponseOfferValues = {
  message: string;
  headline: string;
  proposedHuman: string;
};

export function validateResponseOfferInput(
  input: ResponseOfferValues,
  asset: Pick<Tables<"assets">, "decimals" | "symbol">,
): { fieldErrors: ResponseOfferFieldErrors | null } {
  const fieldErrors: ResponseOfferFieldErrors = {};

  const message = input.message;
  if (message.trim().length > 0 && message.length > MESSAGE_MAX) {
    fieldErrors.message = `Message must be at most ${MESSAGE_MAX} characters`;
  }

  const headline = input.headline.trim();
  if (headline.length > HEADLINE_MAX) {
    fieldErrors.headline = `Headline must be at most ${HEADLINE_MAX} characters`;
  }

  const converted = humanAmountToSmallestUnits(
    input.proposedHuman,
    asset.decimals,
  );
  if (!converted.ok) {
    fieldErrors.proposedHuman = converted.error;
  } else {
    const prec = validateBudgetSmallestUnitsAgainstAsset(
      converted.smallestUnits,
      asset,
    );
    if (!prec.ok) {
      fieldErrors.proposedHuman = prec.error;
    }
  }

  return {
    fieldErrors: Object.keys(fieldErrors).length > 0 ? fieldErrors : null,
  };
}

export function proposedHumanToSmallestUnitsOrThrow(
  proposedHuman: string,
  asset: Pick<Tables<"assets">, "decimals" | "symbol">,
): string {
  const converted = humanAmountToSmallestUnits(proposedHuman, asset.decimals);
  if (!converted.ok) {
    throw new Error(converted.error);
  }
  const prec = validateBudgetSmallestUnitsAgainstAsset(
    converted.smallestUnits,
    asset,
  );
  if (!prec.ok) {
    throw new Error(prec.error);
  }
  return converted.smallestUnits;
}

export { MESSAGE_MAX, HEADLINE_MAX, parseDigitsIntegerString };
