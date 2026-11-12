import { actionCreators } from "@near-js/transactions";
import { validateNep141ContractId } from "@paidaid/shared";

import {
  assertTransactionFinalSuccess,
  normalizeTransactionOutcome,
  readNep141StorageBalanceOf,
} from "@paidaid/near";
import type { NearConfig } from "@paidaid/shared";
import type { PaidAidNearTransactionSigner } from "./paidaid-near-transaction-signer";

const STORAGE_GAS = BigInt("300000000000000");

export type Nep141StorageDepositResult =
  | { ok: true; txHash: string; registered: true }
  | { ok: false; error: string; cancelled?: boolean };

/**
 * Register the connected signer account with a NEP-141 token (NEP-145 storage).
 * Never registers another account — callers must not pass third-party account ids.
 */
export async function sendNep141StorageDeposit(
  signer: PaidAidNearTransactionSigner,
  nearConfig: NearConfig,
  tokenContractId: string,
  depositYocto: bigint,
): Promise<Nep141StorageDepositResult> {
  const contractErr = validateNep141ContractId(tokenContractId);
  if (contractErr) {
    return { ok: false, error: contractErr };
  }
  if (depositYocto <= BigInt(0)) {
    return { ok: false, error: "Invalid storage deposit amount." };
  }

  const submission = await signer.signAndSendTransaction({
    receiverId: tokenContractId.trim(),
    actions: [
      actionCreators.functionCall(
        "storage_deposit",
        {},
        STORAGE_GAS,
        depositYocto,
      ),
    ],
  });

  if (submission.status === "cancelled") {
    return { ok: false, error: "Wallet request cancelled.", cancelled: true };
  }
  if (!submission.txHash) {
    return { ok: false, error: "Storage registration did not return a hash." };
  }

  try {
    assertTransactionFinalSuccess(
      normalizeTransactionOutcome(submission.outcome),
    );
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Storage deposit failed on-chain.",
    };
  }

  const storage = await readNep141StorageBalanceOf(
    nearConfig,
    tokenContractId,
    signer.accountId,
  );
  if (storage.status !== "ok" || !storage.registered) {
    return {
      ok: false,
      error:
        "Storage deposit was submitted but this account is still not registered. Wait a moment and refresh.",
    };
  }

  return { ok: true, txHash: submission.txHash, registered: true };
}
