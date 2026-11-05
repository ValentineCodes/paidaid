import { CORE_METHODS, type NearConfig } from "@paidaid/shared";
import {
  normalizeAccountId,
  validateAccountId,
  validateMessage,
} from "./validation";
import { viewMethod } from "./rpc";

export type SetMessageCall = {
  contractId: string;
  method: typeof CORE_METHODS.setMessage;
  args: { message: string };
};

export function requireContractId(config: NearConfig): string {
  if (!config.contractId) {
    throw new Error("NEAR_CONTRACT_ID is required");
  }
  return config.contractId;
}

export function buildSetMessageCall(
  config: NearConfig,
  message: string,
): SetMessageCall {
  const messageError = validateMessage(message);
  if (messageError) {
    throw new Error(messageError);
  }

  return {
    contractId: requireContractId(config),
    method: CORE_METHODS.setMessage,
    args: { message: message.trim() },
  };
}

export async function getTotalMessages(config: NearConfig): Promise<number> {
  const total = await viewMethod<number>(
    config,
    CORE_METHODS.getTotalMessages,
    {},
  );
  return Number(total);
}

export async function getMessage(
  config: NearConfig,
  accountId: string,
): Promise<string | null> {
  const accountError = validateAccountId(accountId);
  if (accountError) {
    throw new Error(accountError);
  }

  const result = await viewMethod(config, CORE_METHODS.getMessage, {
    account_id: normalizeAccountId(accountId),
  });

  if (result === null || result === undefined) {
    return null;
  }
  if (typeof result !== "string") {
    throw new Error("Unexpected get_message return type");
  }
  return result;
}

type OutcomeLike = {
  transaction_outcome?: { id?: string };
  transaction?: { hash?: string };
};

export function extractTransactionHash(outcome: unknown): string | null {
  if (!outcome || typeof outcome !== "object") {
    return null;
  }

  const value = outcome as OutcomeLike;
  const fromOutcome = value.transaction_outcome?.id;
  if (typeof fromOutcome === "string" && fromOutcome.length > 0) {
    return fromOutcome;
  }

  const fromTransaction = value.transaction?.hash;
  if (typeof fromTransaction === "string" && fromTransaction.length > 0) {
    return fromTransaction;
  }

  if (Array.isArray(outcome)) {
    for (const entry of outcome) {
      const hash = extractTransactionHash(entry);
      if (hash) {
        return hash;
      }
    }
  }

  return null;
}
