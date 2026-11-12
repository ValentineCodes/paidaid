"use client";

import {
  buildSetMessageCall,
  extractTransactionHash,
  getMessage,
  getTotalMessages,
  readNearPublicConfig,
} from "@paidaid/near";
import type { NearConfig } from "@paidaid/shared";
import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  formatTransactionError,
  formatYoctoNearBalance,
  MIN_SUBMIT_BALANCE_YOCTO,
} from "../wallet/format-transaction-error";
import { sendSetMessageTransaction } from "../wallet/send-set-message";
import {
  WalletMountContext,
  WalletSelectorReadyContext,
} from "../wallet/mount-context";
import { usePaidAidWallet } from "../wallet/use-paidaid-wallet";
import { usePaidAidNearWallet } from "../wallet/paidaid-near-wallet-context";
import { fetchNearAccountBalanceYocto } from "../wallet/fetch-account-balance";

type LoadState = "idle" | "loading" | "success" | "error";

function readClientNearConfig(): NearConfig {
  return readNearPublicConfig({
    NEXT_PUBLIC_NEAR_NETWORK_ID: process.env.NEXT_PUBLIC_NEAR_NETWORK_ID,
    NEXT_PUBLIC_NEAR_RPC_URL: process.env.NEXT_PUBLIC_NEAR_RPC_URL,
    NEXT_PUBLIC_NEAR_CONTRACT_ID: process.env.NEXT_PUBLIC_NEAR_CONTRACT_ID,
  });
}

export default function ContractInteractionForm() {
  const walletReady = useContext(WalletMountContext);
  const selectorReady = useContext(WalletSelectorReadyContext);
  if (!walletReady || !selectorReady) {
    return <p className="text-sm text-stone-500">Loading wallet connection…</p>;
  }
  return <ContractInteractionFormInner />;
}

function ContractInteractionFormInner() {
  const { accountId, status: walletStatus, connect } = usePaidAidWallet();
  const { getTransactionSigner } = usePaidAidNearWallet();

  const configResult = useMemo(() => {
    try {
      return { config: readClientNearConfig(), error: null as string | null };
    } catch (error) {
      return {
        config: null,
        error:
          error instanceof Error ? error.message : "Invalid NEAR configuration",
      };
    }
  }, []);

  const nearConfig = configResult.config;
  const configError = configResult.error;

  const [message, setMessage] = useState("");
  const [lookupAccountId, setLookupAccountId] = useState("");

  const [submitState, setSubmitState] = useState<LoadState>("idle");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [transactionHash, setTransactionHash] = useState<string | null>(null);

  const [myMessageState, setMyMessageState] = useState<LoadState>("idle");
  const [myMessage, setMyMessage] = useState<string | null>(null);
  const [myMessageError, setMyMessageError] = useState<string | null>(null);

  const [lookupState, setLookupState] = useState<LoadState>("idle");
  const [lookupMessage, setLookupMessage] = useState<string | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);

  const [totalState, setTotalState] = useState<LoadState>("idle");
  const [totalMessages, setTotalMessages] = useState<number | null>(null);
  const [totalError, setTotalError] = useState<string | null>(null);

  const [balanceYocto, setBalanceYocto] = useState<bigint | null>(null);
  const [balanceState, setBalanceState] = useState<LoadState>("idle");

  const walletConnected = walletStatus === "connected" && Boolean(accountId);
  const balanceYoctoForAccount =
    walletConnected && accountId ? balanceYocto : null;
  const balanceStateForAccount =
    walletConnected && accountId ? balanceState : "idle";
  const balanceTooLow =
    balanceYoctoForAccount !== null &&
    balanceYoctoForAccount < MIN_SUBMIT_BALANCE_YOCTO;
  const submitPending = submitState === "loading";

  const refreshBalance = useCallback(async () => {
    if (!accountId || !nearConfig) {
      return;
    }
    setBalanceState("loading");
    try {
      const amount = await fetchNearAccountBalanceYocto(
        nearConfig.rpcUrl,
        accountId,
      );
      setBalanceYocto(amount);
      setBalanceState("success");
    } catch {
      setBalanceYocto(null);
      setBalanceState("error");
    }
  }, [accountId, nearConfig]);

  useEffect(() => {
    if (!walletConnected || !accountId) {
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads balance from RPC after connect
    void refreshBalance();
  }, [accountId, refreshBalance, walletConnected]);

  const refreshTotal = useCallback(async () => {
    if (!nearConfig) {
      return;
    }
    setTotalState("loading");
    setTotalError(null);
    try {
      const total = await getTotalMessages(nearConfig);
      setTotalMessages(total);
      setTotalState("success");
    } catch (error) {
      setTotalState("error");
      setTotalError(
        error instanceof Error ? error.message : "Could not load total count.",
      );
    }
  }, [nearConfig]);

  const loadMyMessage = useCallback(async () => {
    if (!nearConfig || !accountId) {
      return;
    }
    setMyMessageState("loading");
    setMyMessageError(null);
    try {
      const saved = await getMessage(nearConfig, accountId);
      setMyMessage(saved);
      setMyMessageState("success");
    } catch (error) {
      setMyMessageState("error");
      setMyMessageError(
        error instanceof Error ? error.message : "Could not load your message.",
      );
    }
  }, [accountId, nearConfig]);

  const loadLookupMessage = useCallback(async () => {
    if (!nearConfig) {
      return;
    }
    setLookupState("loading");
    setLookupError(null);
    setLookupMessage(null);
    try {
      const saved = await getMessage(nearConfig, lookupAccountId);
      setLookupMessage(saved);
      setLookupState("success");
    } catch (error) {
      setLookupState("error");
      setLookupError(
        error instanceof Error ? error.message : "Could not load that message.",
      );
    }
  }, [lookupAccountId, nearConfig]);

  const submitMessage = useCallback(async () => {
    if (!nearConfig || !walletConnected) {
      return;
    }
    setSubmitState("loading");
    setSubmitError(null);
    setTransactionHash(null);
    try {
      if (accountId) {
        const amount = await fetchNearAccountBalanceYocto(
        nearConfig.rpcUrl,
        accountId,
      );
        setBalanceYocto(amount);
        if (amount < MIN_SUBMIT_BALANCE_YOCTO) {
          throw new Error(
            `Account ${accountId} has ${formatYoctoNearBalance(amount)}. You need a small amount of NEAR on localnet to pay gas (about 0.001 NEAR or less).`,
          );
        }
      }

      const signer = await getTransactionSigner();

      const call = buildSetMessageCall(nearConfig, message);
      const outcome = await sendSetMessageTransaction(
        signer,
        call.contractId,
        message,
      );
      const hash = extractTransactionHash(outcome);
      setTransactionHash(hash);
      setSubmitState("success");
      await refreshTotal();
      await loadMyMessage();
    } catch (error) {
      setSubmitState("error");
      setSubmitError(formatTransactionError(error));
    }
  }, [
    accountId,
    getTransactionSigner,
    loadMyMessage,
    message,
    nearConfig,
    refreshTotal,
    walletConnected,
  ]);

  if (configError || !nearConfig?.contractId) {
    return (
      <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
        {configError ??
          "Set NEXT_PUBLIC_NEAR_CONTRACT_ID in apps/web/.env.local to your deployed PaidAidCore account."}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Save a message</h2>
        {!walletConnected ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-stone-600 dark:text-stone-400">
              Connect a NEAR wallet to sign{" "}
              <code className="font-mono text-xs">set_message</code>. On
              localnet, choose a wallet that supports testnet with RPC{" "}
              <span className="font-mono text-xs">127.0.0.1:3030</span>.
            </p>
            <button
              type="button"
              onClick={() => void connect()}
              className="btn-ink rounded-lg px-3 py-1.5 text-sm font-medium"
            >
              Connect
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-1 text-sm text-stone-600 dark:text-stone-400">
            <p>
              Signed in as{" "}
              <span className="font-mono text-stone-900">
                {accountId}
              </span>
            </p>
            {balanceStateForAccount === "success" &&
            balanceYoctoForAccount !== null ? (
              <p>
                Balance:{" "}
                <span className="font-mono text-stone-900">
                  {formatYoctoNearBalance(balanceYoctoForAccount)}
                </span>
              </p>
            ) : null}
            {balanceTooLow ? (
              <p className="text-amber-800 dark:text-amber-200">
                Fund this account on localnet (import or create it in your wallet with RPC{" "}
                <span className="font-mono">http://127.0.0.1:3030</span>).
              </p>
            ) : null}
          </div>
        )}
        <label className="flex flex-col gap-2 text-sm">
          <span className="font-medium text-stone-700 dark:text-stone-300">
            Message
          </span>
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            rows={3}
            className="rounded-lg border border-stone-300 bg-white px-3 py-2 font-sans dark:border-stone-700 dark:bg-stone-950"
            placeholder="PaidAid v0 on localnet"
            disabled={submitPending}
          />
        </label>
        <button
          type="button"
          disabled={
            !walletConnected ||
            submitPending ||
            !message.trim() ||
            balanceTooLow
          }
          onClick={() => void submitMessage()}
          className="btn-ink w-fit rounded-lg px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitPending ? "Submitting…" : "Submit message"}
        </button>
        {submitState === "success" ? (
          <Feedback tone="success" title="Transaction submitted">
            {transactionHash ? (
              <span className="break-all font-mono text-sm">
                {transactionHash}
              </span>
            ) : (
              <span className="text-sm">
                Signed successfully (hash unavailable in wallet response).
              </span>
            )}
          </Feedback>
        ) : null}
        {submitError ? (
          <Feedback tone="error" title="Transaction failed">
            {submitError}
          </Feedback>
        ) : null}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Read messages</h2>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            disabled={!walletConnected || myMessageState === "loading"}
            onClick={() => void loadMyMessage()}
            className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-medium disabled:opacity-50 dark:border-stone-600"
          >
            {myMessageState === "loading" ? "Loading…" : "Get my saved message"}
          </button>
          <button
            type="button"
            disabled={totalState === "loading"}
            onClick={() => void refreshTotal()}
            className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-medium disabled:opacity-50 dark:border-stone-600"
          >
            {totalState === "loading"
              ? "Loading…"
              : "Get total message accounts"}
          </button>
        </div>
        {myMessageState === "success" ? (
          <ResultCard
            label="Your message"
            value={
              myMessage === null
                ? "No message saved for your account."
                : myMessage
            }
          />
        ) : null}
        {myMessageError ? (
          <Feedback tone="error" title="Could not load your message">
            {myMessageError}
          </Feedback>
        ) : null}
        {totalState === "success" && totalMessages !== null ? (
          <ResultCard
            label="Total accounts with messages"
            value={String(totalMessages)}
          />
        ) : null}
        {totalError ? (
          <Feedback tone="error" title="Could not load total">
            {totalError}
          </Feedback>
        ) : null}
        <label className="flex flex-col gap-2 text-sm">
          <span className="font-medium text-stone-700 dark:text-stone-300">
            Another account ID
          </span>
          <input
            type="text"
            value={lookupAccountId}
            onChange={(event) => setLookupAccountId(event.target.value)}
            className="rounded-lg border border-stone-300 bg-white px-3 py-2 font-mono dark:border-stone-700 dark:bg-stone-950"
            placeholder="user.local"
            disabled={lookupState === "loading"}
          />
        </label>
        <button
          type="button"
          disabled={lookupState === "loading" || !lookupAccountId.trim()}
          onClick={() => void loadLookupMessage()}
          className="w-fit rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-medium disabled:opacity-50 dark:border-stone-600"
        >
          {lookupState === "loading" ? "Loading…" : "Get message for account"}
        </button>
        {lookupState === "success" ? (
          <ResultCard
            label={`Message for ${lookupAccountId.trim()}`}
            value={
              lookupMessage === null
                ? "No message saved for this account."
                : lookupMessage
            }
          />
        ) : null}
        {lookupError ? (
          <Feedback tone="error" title="Lookup failed">
            {lookupError}
          </Feedback>
        ) : null}
      </section>

      <p className="text-xs text-stone-500">
        Contract: <span className="font-mono">{nearConfig.contractId}</span> on{" "}
        {nearConfig.networkId}
      </p>
    </div>
  );
}

function Feedback({
  tone,
  title,
  children,
}: {
  tone: "success" | "error";
  title: string;
  children: React.ReactNode;
}) {
  const styles =
    tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
      : "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200";

  return (
    <div className={`rounded-lg border px-4 py-3 text-sm ${styles}`}>
      <p className="font-medium">{title}</p>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function ResultCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-stone-200 px-4 py-3 dark:border-stone-800">
      <p className="text-sm text-stone-500">{label}</p>
      <p className="mt-1 font-mono text-sm break-all">{value}</p>
    </div>
  );
}
