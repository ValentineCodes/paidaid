import type { Transaction, Wallet } from "@near-wallet-selector/core";
import { nearActionsToConnectorActions } from "@hot-labs/near-connect";
import type { NearWalletBase } from "@hot-labs/near-connect";
import type { Action } from "@near-js/transactions";
import { extractTransactionHash } from "@paidaid/near";
import type { NearNetworkId } from "@paidaid/shared";

import {
  assertConnectorNetworkMatchesApp,
  type NearConnectNetwork,
} from "./near-connect-config";
import { capabilityError, type ConnectedWalletSession } from "./near-connect-driver";
import type { PaidAidWalletCapabilities } from "./paidaid-near-wallet-types";
import {
  classifyNearTransactionError,
  formatNearTransactionError,
  isUserRejectedTransaction,
} from "./near-transaction-errors";

export type PaidAidTransactionRequest = {
  receiverId: string;
  actions: Action[];
};

export type PaidAidTxSubmissionStatus =
  | "submitted"
  | "cancelled"
  | "failed";

export type PaidAidTxSubmission = {
  status: PaidAidTxSubmissionStatus;
  outcome: unknown;
  txHash: string | null;
  failureKind?: ReturnType<typeof classifyNearTransactionError>;
};

export type PaidAidNearTransactionSigner = {
  accountId: string;
  walletId: string;
  walletName: string;
  capabilities: PaidAidWalletCapabilities;
  connectorNetwork: NearConnectNetwork;
  appNetworkId: NearNetworkId;
  signAndSendTransaction: (
    request: PaidAidTransactionRequest,
  ) => Promise<PaidAidTxSubmission>;
  signAndSendTransactions: (
    requests: PaidAidTransactionRequest[],
  ) => Promise<PaidAidTxSubmission[]>;
  toLegacyWallet: () => Wallet;
};

function validateTransactionRequest(
  request: PaidAidTransactionRequest,
  signerId: string,
): void {
  const receiver = request.receiverId?.trim();
  if (!receiver) {
    throw new Error("Transaction receiver is missing.");
  }
  if (!signerId?.trim()) {
    throw new Error("Connected NEAR account is missing.");
  }
  if (!Array.isArray(request.actions) || request.actions.length === 0) {
    throw new Error("Transaction has no actions.");
  }
}

function outcomeToSubmission(outcome: unknown): PaidAidTxSubmission {
  const txHash = extractTransactionHash(outcome);
  if (!txHash) {
    return {
      status: "failed",
      outcome,
      txHash: null,
      failureKind: "missing_tx_hash",
    };
  }
  return {
    status: "submitted",
    outcome,
    txHash,
  };
}

function errorToSubmission(error: unknown): PaidAidTxSubmission {
  if (isUserRejectedTransaction(error)) {
    return {
      status: "cancelled",
      outcome: error,
      txHash: null,
      failureKind: "user_rejected",
    };
  }
  return {
    status: "failed",
    outcome: error,
    txHash: null,
    failureKind: classifyNearTransactionError(error),
  };
}

export function createPaidAidNearTransactionSigner(
  session: ConnectedWalletSession,
  connectorNetwork: NearConnectNetwork,
  appNetworkId: NearNetworkId,
): PaidAidNearTransactionSigner {
  assertConnectorNetworkMatchesApp(appNetworkId, connectorNetwork);
  const capability = capabilityError(
    session.capabilities,
    "signAndSendTransaction",
  );
  if (capability) {
    throw new Error(capability);
  }

  const base: NearWalletBase = session.wallet;
  const signerId = session.accountId;

  async function signAndSendTransaction(
    request: PaidAidTransactionRequest,
  ): Promise<PaidAidTxSubmission> {
    validateTransactionRequest(request, signerId);
    try {
      const actions = nearActionsToConnectorActions(request.actions);
      const outcome = await base.signAndSendTransaction({
        network: connectorNetwork,
        signerId,
        receiverId: request.receiverId.trim(),
        actions,
      });
      const submission = outcomeToSubmission(outcome);
      if (submission.status === "failed") {
        throw new Error(formatNearTransactionError(new Error("missing_tx_hash")));
      }
      return submission;
    } catch (error) {
      const submission = errorToSubmission(error);
      if (submission.status === "cancelled") {
        throw new Error(formatNearTransactionError(error));
      }
      throw new Error(formatNearTransactionError(error));
    }
  }

  async function signAndSendTransactions(
    requests: PaidAidTransactionRequest[],
  ): Promise<PaidAidTxSubmission[]> {
    if (!session.capabilities.signAndSendTransactions) {
      throw new Error(
        "This wallet cannot sign multiple transactions in one request. Connect another wallet or submit one transaction at a time.",
      );
    }
    if (requests.length === 0) {
      throw new Error("No transactions to sign.");
    }
    for (const request of requests) {
      validateTransactionRequest(request, signerId);
    }
    try {
      const outcome = await base.signAndSendTransactions({
        network: connectorNetwork,
        signerId,
        transactions: requests.map((request) => ({
          receiverId: request.receiverId.trim(),
          actions: nearActionsToConnectorActions(request.actions),
        })),
      });
      const list = Array.isArray(outcome) ? outcome : [outcome];
      return list.map((entry) => {
        const submission = outcomeToSubmission(entry);
        if (submission.status === "failed") {
          throw new Error(formatNearTransactionError("missing_tx_hash"));
        }
        return submission;
      });
    } catch (error) {
      throw new Error(formatNearTransactionError(error));
    }
  }

  function toLegacyWallet(): Wallet {
    return {
      async signAndSendTransaction(params: Transaction) {
        const result = await signAndSendTransaction({
          receiverId: params.receiverId,
          actions: params.actions as Action[],
        });
        if (result.status !== "submitted") {
          throw new Error(formatNearTransactionError(result.outcome));
        }
        return result.outcome;
      },
    } as Wallet;
  }

  return {
    accountId: signerId,
    walletId: session.walletId,
    walletName: session.walletName,
    capabilities: session.capabilities,
    connectorNetwork,
    appNetworkId,
    signAndSendTransaction,
    signAndSendTransactions,
    toLegacyWallet,
  };
}
