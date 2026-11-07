import type { Wallet } from "@near-wallet-selector/core";
import { actionCreators } from "@near-js/transactions";
import { CORE_METHODS } from "@paidaid/shared";
import { SET_MESSAGE_GAS } from "./constants";

/** Sign and send PaidAidCore `set_message` using NAJ actions (avoids react-hook `callFunction` gas strings). */
export async function sendSetMessageTransaction(
  wallet: Wallet,
  contractId: string,
  message: string,
): Promise<unknown> {
  const trimmed = message.trim();
  if (!trimmed) {
    throw new Error("Message cannot be empty.");
  }

  return wallet.signAndSendTransaction({
    receiverId: contractId,
    actions: [
      actionCreators.functionCall(
        CORE_METHODS.setMessage,
        { message: trimmed },
        SET_MESSAGE_GAS,
        BigInt(0),
      ),
    ],
  });
}
