"use client";

import { usePaidAidWallet } from "../wallet/use-paidaid-wallet";
import { usePaidAidNearWallet } from "../wallet/paidaid-near-wallet-context";

export function WalletControls() {
  const {
    status,
    networkId,
    accountId,
    error,
    connect,
    disconnect,
    clearError,
  } = usePaidAidWallet();
  const { selectedWalletName, availableWallets, selectedWalletId } =
    usePaidAidNearWallet();
  const walletIcon =
    availableWallets.find((w) => w.id === selectedWalletId)?.icon ?? null;

  const busy =
    status === "initializing" ||
    status === "connecting" ||
    status === "disconnecting";

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <NetworkBadge networkId={networkId} />
        <StatusBadge status={status} />
        {accountId ? (
          <>
            {selectedWalletName ? (
              <WalletProviderBadge
                name={selectedWalletName}
                icon={walletIcon}
              />
            ) : null}
            <AccountBadge accountId={accountId} />
            <button
              type="button"
              onClick={() => void disconnect()}
              disabled={busy}
              className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-800 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-stone-600 dark:text-stone-100 dark:hover:bg-stone-800"
            >
              {status === "disconnecting" ? "Disconnecting…" : "Disconnect"}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => void connect()}
            disabled={busy}
            className="btn-ink rounded-lg px-3 py-1.5 text-sm font-medium transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {connectButtonLabel(status)}
          </button>
        )}
      </div>
      {error ? (
        <div
          role="alert"
          className="flex max-w-sm items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-right text-xs text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
        >
          <span className="flex-1">{error}</span>
          <button
            type="button"
            onClick={clearError}
            className="shrink-0 font-medium underline-offset-2 hover:underline"
          >
            Dismiss
          </button>
        </div>
      ) : null}
    </div>
  );
}

function NetworkBadge({ networkId }: { networkId: string }) {
  return (
    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
      {networkId}
    </span>
  );
}

function StatusBadge({
  status,
}: {
  status: ReturnType<typeof usePaidAidWallet>["status"];
}) {
  const label = statusLabel(status);
  const tone =
    status === "connected"
      ? "text-on-light-surface border-stone-200 bg-stone-50 dark:border-stone-700 dark:bg-stone-900"
      : status === "connecting" || status === "initializing"
        ? "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
        : "border-stone-200 bg-white text-stone-600 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-400";

  return (
    <span
      className={`rounded-full border px-2.5 py-1 text-xs font-medium ${tone}`}
    >
      {label}
    </span>
  );
}

function connectButtonLabel(
  status: ReturnType<typeof usePaidAidWallet>["status"],
): string {
  switch (status) {
    case "initializing":
      return "Loading…";
    case "connecting":
      return "Connecting…";
    default:
      return "Connect";
  }
}

function statusLabel(
  status: ReturnType<typeof usePaidAidWallet>["status"],
): string {
  switch (status) {
    case "initializing":
      return "Loading wallet";
    case "connecting":
      return "Connecting";
    case "connected":
      return "Connected";
    case "disconnecting":
      return "Disconnecting";
    case "disconnected":
      return "Not connected";
  }
}

function WalletProviderBadge({
  name,
  icon,
}: {
  name: string;
  icon: string | null;
}) {
  return (
    <span className="flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-2 py-1 text-xs dark:border-stone-700 dark:bg-stone-900">
      {icon ? (
        // eslint-disable-next-line @next/next/no-img-element -- dynamic wallet icon
        <img src={icon} alt="" width={16} height={16} className="size-4 rounded" />
      ) : null}
      <span className="max-w-[7rem] truncate">{name}</span>
    </span>
  );
}

function AccountBadge({ accountId }: { accountId: string }) {
  return (
    <span
      title={accountId}
      className="text-on-light-surface max-w-48 truncate rounded-lg border border-stone-200 bg-white px-2.5 py-1 font-mono text-xs dark:border-stone-700 dark:bg-stone-900 sm:max-w-xs"
    >
      {accountId}
    </span>
  );
}
