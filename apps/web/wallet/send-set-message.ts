import { actionCreators } from "@near-js/transactions";
import { CORE_METHODS } from "@paidaid/shared";
import { SET_MESSAGE_GAS } from "./constants";
import type { PaidAidNearTransactionSigner } from "./paidaid-near-transaction-signer";

export async function sendSetMessageTransaction(
  signer: PaidAidNearTransactionSigner,
  contractId: string,
  message: string,
): Promise<unknown> {
  const trimmed = message.trim();
  if (!trimmed) {
    throw new Error("Message cannot be empty.");
  }
  if (!contractId?.trim()) {
    throw new Error("Contract id is missing.");
  }

  const submission = await signer.signAndSendTransaction({
    receiverId: contractId.trim(),
    actions: [
      actionCreators.functionCall(
        CORE_METHODS.setMessage,
        { message: trimmed },
        SET_MESSAGE_GAS,
        BigInt(0),
      ),
    ],
  });

  return submission.outcome;
}
