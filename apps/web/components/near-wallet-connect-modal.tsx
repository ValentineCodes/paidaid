"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { ChevronRightIcon, Loader2Icon } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useMarketplaceWalletAuth } from "../lib/wallet/use-marketplace-wallet-auth";
import { formatWalletConnectionError } from "../wallet/errors";
import {
  capabilityError,
  isUserCancelledConnection,
} from "../wallet/near-connect-driver";
import {
  detectClientPlatform,
  filterWalletsForNetwork,
  networkBadgeLabel,
  networkDisplayName,
  walletUnavailableReason,
  type WalletConnectUiPhase,
} from "../wallet/near-wallet-connect-helpers";
import { usePaidAidNearWallet } from "../wallet/paidaid-near-wallet-context";
import type { PaidAidWalletManifestSummary } from "../wallet/paidaid-near-wallet-types";

const STUCK_HINT_MS = 15_000;

export type NearWalletConnectModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  authenticate?: boolean;
  preferPicker?: boolean;
  onConnected?: () => void;
  onDismissed?: () => void;
};

export function NearWalletConnectModal({
  open,
  onOpenChange,
  authenticate = false,
  preferPicker = false,
  onConnected,
  onDismissed,
}: NearWalletConnectModalProps) {
  const titleId = useId();
  const closedAfterSuccessRef = useRef(false);
  const stuckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [phase, setPhase] = useState<WalletConnectUiPhase>("loading");
  const [selectedWallet, setSelectedWallet] =
    useState<PaidAidWalletManifestSummary | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const {
    initialized,
    initError,
    connectionError,
    appNetworkId,
    connectorNetwork,
    availableWallets,
    accountId,
    selectedWalletName,
    selectedWalletId,
    status,
    capabilities,
    pendingConnect,
    connect,
    disconnect,
    clearErrors,
    refreshSession,
    getSessionAccountId,
    abandonConnectionAttempt,
  } = usePaidAidNearWallet();

  const { authenticateConnectedAccount } = useMarketplaceWalletAuth();
  const clientPlatform = useMemo(() => detectClientPlatform(), []);

  const walletsForNetwork = useMemo(
    () => filterWalletsForNetwork(availableWallets, connectorNetwork, clientPlatform),
    [availableWallets, clientPlatform, connectorNetwork],
  );

  const selectedWalletIcon = useMemo(() => {
    if (!selectedWalletId) {
      return null;
    }
    return availableWallets.find((w) => w.id === selectedWalletId)?.icon ?? null;
  }, [availableWallets, selectedWalletId]);

  const resetLocalState = useCallback(() => {
    setPhase("loading");
    setSelectedWallet(null);
    setMessage(null);
    setCopied(false);
    if (stuckTimerRef.current) {
      clearTimeout(stuckTimerRef.current);
      stuckTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!open) {
      resetLocalState();
      return;
    }
    clearErrors();
    if (
      phase === "connecting" ||
      phase === "waiting_wallet" ||
      phase === "authenticating"
    ) {
      return;
    }
    if (!initialized) {
      setPhase("loading");
      return;
    }
    if (initError) {
      setPhase("error");
      setMessage(initError);
      return;
    }
    if (
      status === "connected" &&
      accountId &&
      !preferPicker &&
      phase !== "connecting" &&
      phase !== "waiting_wallet"
    ) {
      setPhase(authenticate ? "authenticating" : "connected");
      return;
    }
    setPhase(walletsForNetwork.length ? "pick_wallet" : "unavailable");
    setMessage(
      walletsForNetwork.length
        ? null
        : `No NEAR wallets are available on ${networkDisplayName(appNetworkId)} for this device.`,
    );
  }, [
    accountId,
    appNetworkId,
    authenticate,
    clearErrors,
    initError,
    initialized,
    open,
    resetLocalState,
    status,
    phase,
    preferPicker,
    walletsForNetwork.length,
  ]);

  useEffect(() => {
    if (!open || (phase !== "connecting" && phase !== "waiting_wallet")) {
      if (stuckTimerRef.current) {
        clearTimeout(stuckTimerRef.current);
        stuckTimerRef.current = null;
      }
      return;
    }
    stuckTimerRef.current = setTimeout(() => {
      setPhase("waiting_wallet");
    }, STUCK_HINT_MS);
    return () => {
      if (stuckTimerRef.current) {
        clearTimeout(stuckTimerRef.current);
        stuckTimerRef.current = null;
      }
    };
  }, [open, phase]);

  const finishSuccess = useCallback(() => {
    closedAfterSuccessRef.current = true;
    onConnected?.();
    onOpenChange(false);
  }, [onConnected, onOpenChange]);

  const runAuthentication = useCallback(
    async (account: string) => {
      setPhase("authenticating");
      setMessage("Approve the sign-in message in your wallet.");
      const signInCapability = capabilityError(capabilities, "signMessage");
      if (signInCapability) {
        setPhase("error");
        setMessage(signInCapability);
        return;
      }
      const result = await authenticateConnectedAccount(account);
      if (result.error) {
        setPhase("error");
        setMessage(result.error);
        return;
      }
      setPhase("connected");
      setMessage("Signed in to PaidAid.");
      finishSuccess();
    },
    [authenticateConnectedAccount, capabilities, finishSuccess],
  );

  useEffect(() => {
    if (!open || !authenticate || phase !== "authenticating") {
      return;
    }
    if (status !== "connected" || !accountId || pendingConnect) {
      return;
    }
    void runAuthentication(accountId);
  }, [
    accountId,
    authenticate,
    open,
    pendingConnect,
    phase,
    runAuthentication,
    status,
  ]);

  const handleSelectWallet = useCallback(
    async (wallet: PaidAidWalletManifestSummary) => {
      const unavailable = walletUnavailableReason(wallet, clientPlatform);
      if (unavailable) {
        setPhase("unavailable");
        setMessage(unavailable);
        setSelectedWallet(wallet);
        return;
      }
      const unsupported = !wallet.capabilities.signMessage
        ? "This wallet cannot sign messages for PaidAid sign-in."
        : !wallet.capabilities.signAndSendTransaction
          ? "This wallet cannot sign transactions on PaidAid."
          : null;
      if (unsupported) {
        setPhase("unsupported");
        setMessage(unsupported);
        setSelectedWallet(wallet);
        return;
      }

      setSelectedWallet(wallet);
      setPhase("connecting");
      setMessage(`Opening ${wallet.name}…`);
      try {
        await connect(wallet.id);
        await refreshSession();
        const connectedAccount = getSessionAccountId();
        if (authenticate && connectedAccount) {
          await runAuthentication(connectedAccount);
          return;
        }
        setPhase("connected");
        setMessage(`Connected with ${wallet.name}.`);
        finishSuccess();
      } catch (error) {
        if (isUserCancelledConnection(error)) {
          setPhase("pick_wallet");
          setMessage("Connection cancelled.");
          return;
        }
        setPhase("error");
        setMessage(formatWalletConnectionError(error));
      }
    },
    [
      authenticate,
      clientPlatform,
      connect,
      finishSuccess,
      getSessionAccountId,
      refreshSession,
      runAuthentication,
    ],
  );

  const handleDisconnect = useCallback(async () => {
    setMessage(null);
    try {
      await disconnect();
      setPhase(walletsForNetwork.length ? "pick_wallet" : "unavailable");
    } catch (error) {
      setPhase("error");
      setMessage(formatWalletConnectionError(error));
    }
  }, [disconnect, walletsForNetwork.length]);

  const handleCopyAccount = useCallback(async () => {
    if (!accountId) {
      return;
    }
    try {
      await navigator.clipboard.writeText(accountId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setMessage("Could not copy to clipboard.");
    }
  }, [accountId]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        if (!closedAfterSuccessRef.current) {
          if (
            phase === "connecting" ||
            phase === "waiting_wallet" ||
            phase === "pick_wallet" ||
            phase === "loading"
          ) {
            abandonConnectionAttempt();
          }
          onDismissed?.();
        }
        closedAfterSuccessRef.current = false;
        onOpenChange(false);
      } else {
        onOpenChange(true);
      }
    },
    [abandonConnectionAttempt, onDismissed, onOpenChange, phase],
  );

  const showConnectedPanel =
    (phase === "connected" || phase === "authenticating") &&
    status === "connected" &&
    Boolean(accountId) &&
    !preferPicker;

  const networkLabel = networkDisplayName(appNetworkId);
  const networkBadge = networkBadgeLabel(appNetworkId);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="gap-0 overflow-hidden rounded-2xl border-border bg-popover p-0 text-popover-foreground shadow-xl ring-1 ring-border/50 sm:max-w-[420px]"
        overlayClassName="bg-black/30 backdrop-blur-[3px]"
        aria-labelledby={titleId}
      >
        <ConnectModalHeader titleId={titleId} networkBadge={networkBadge} />

        <div className="max-h-[min(72vh,30rem)] overflow-y-auto px-3 py-3 sm:px-4 sm:pb-4">
          {phase === "loading" ? <WalletListSkeleton /> : null}

          {showConnectedPanel && accountId ? (
            <ConnectedWalletPanel
              accountId={accountId}
              walletName={selectedWalletName}
              walletIcon={selectedWalletIcon}
              networkLabel={networkLabel}
              statusLabel={status === "connected" ? "Connected" : status}
              copied={copied}
              onCopy={() => void handleCopyAccount()}
              onDisconnect={() => void handleDisconnect()}
              onChooseAnother={() => {
                void handleDisconnect().then(() => setPhase("pick_wallet"));
              }}
              message={message}
            />
          ) : null}

          {phase === "pick_wallet" ? (
            <WalletPickerList
              wallets={walletsForNetwork}
              disabled={pendingConnect}
              onSelect={(wallet) => void handleSelectWallet(wallet)}
            />
          ) : null}

          {phase === "connecting" || phase === "waiting_wallet" ? (
            <ProgressPanel
              title={
                phase === "waiting_wallet"
                  ? "Waiting for your wallet"
                  : "Connecting"
              }
              body={
                phase === "waiting_wallet"
                  ? `Approve in ${selectedWallet?.name ?? "your wallet"}, then return here.`
                  : (message ?? "Continue in your wallet extension or app.")
              }
              wallet={selectedWallet}
              waiting={phase === "waiting_wallet"}
            />
          ) : null}

          {phase === "authenticating" ? (
            <ProgressPanel
              title="Sign in with your wallet"
              body={message ?? "Approve the message to continue."}
              wallet={selectedWallet}
              waiting
            />
          ) : null}

          {(phase === "error" || phase === "unavailable" || phase === "unsupported") && (
            <div className="space-y-3 px-1">
              <ErrorPanel
                title={
                  phase === "unavailable"
                    ? "Wallet unavailable"
                    : phase === "unsupported"
                      ? "Unsupported capability"
                      : "Could not connect"
                }
                body={message ?? connectionError ?? "Try again or pick a different wallet."}
                wallet={selectedWallet}
              />
              {selectedWallet?.website ? (
                <a
                  href={selectedWallet.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex text-xs font-semibold text-emerald-700 underline-offset-2 hover:underline"
                >
                  Get {selectedWallet.name}
                </a>
              ) : null}
              <Button
                type="button"
                variant="outline"
                className="h-10 w-full rounded-full"
                onClick={() => {
                  setPhase("pick_wallet");
                  setMessage(null);
                }}
              >
                Back to wallets
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ConnectModalHeader({
  titleId,
  networkBadge,
}: {
  titleId: string;
  networkBadge: string;
}) {
  return (
    <div className="border-b border-border bg-muted/35 px-4 pb-4 pt-5">
      <DialogHeader className="gap-2 text-left">
        <span className="inline-flex w-fit rounded-full border border-border bg-card px-2.5 py-0.5 text-[10px] font-semibold tracking-wide text-muted-foreground">
          {networkBadge}
        </span>
        <DialogTitle
          id={titleId}
          className="text-lg font-semibold tracking-tight text-popover-foreground"
        >
          Connect a wallet
        </DialogTitle>
        <DialogDescription className="text-xs leading-relaxed text-muted-foreground">
          You will be prompted to sign in after this.
        </DialogDescription>
      </DialogHeader>
    </div>
  );
}

function WalletListSkeleton() {
  return (
    <ul className="flex flex-col gap-2 px-1" aria-hidden>
      {[1, 2, 3].map((key) => (
        <li
          key={key}
          className="flex h-[62px] items-center gap-3 rounded-2xl border border-border bg-muted/25 px-3"
        >
          <div className="size-11 animate-pulse rounded-xl bg-stone-300/70" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-28 animate-pulse rounded bg-stone-300/70" />
            <div className="h-2.5 w-40 animate-pulse rounded bg-stone-300/50" />
          </div>
        </li>
      ))}
    </ul>
  );
}

function WalletPickerList({
  wallets,
  disabled,
  onSelect,
}: {
  wallets: PaidAidWalletManifestSummary[];
  disabled: boolean;
  onSelect: (wallet: PaidAidWalletManifestSummary) => void;
}) {
  if (!wallets.length) {
    return (
      <p className="px-1 text-sm text-muted-foreground">
        No compatible wallets were found for this network.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-1.5">
      {wallets.map((wallet) => (
        <li key={wallet.id}>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onSelect(wallet)}
            className="group flex w-full items-center gap-3 rounded-2xl border border-transparent bg-muted/25 px-3 py-2.5 text-left transition hover:border-border hover:bg-card hover:shadow-sm disabled:opacity-50"
          >
            <WalletIcon src={wallet.icon} alt="" size="md" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-semibold text-popover-foreground">
                {wallet.name}
              </span>
              <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                {walletSubtitle(wallet)}
              </span>
            </span>
            <ChevronRightIcon
              className="size-4 shrink-0 text-stone-500 transition group-hover:translate-x-0.5 group-hover:text-stone-600"
              aria-hidden
            />
          </button>
        </li>
      ))}
    </ul>
  );
}

function walletSubtitle(wallet: PaidAidWalletManifestSummary): string {
  const parts: string[] = [];
  if (wallet.capabilities.signMessage) {
    parts.push("Sign-in");
  }
  if (wallet.capabilities.signAndSendTransaction) {
    parts.push("Transactions");
  }
  if (wallet.description?.trim()) {
    return wallet.description.trim();
  }
  return parts.length ? parts.join(" · ") : "NEAR wallet";
}

function WalletIcon({
  src,
  alt,
  size = "md",
}: {
  src: string;
  alt: string;
  size?: "md" | "lg";
}) {
  const box = size === "lg" ? "size-12 rounded-2xl" : "size-11 rounded-xl";
  if (src.startsWith("data:") || src.startsWith("http")) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- wallet icons are dynamic third-party URLs
      <img
        src={src}
        alt={alt}
        width={size === "lg" ? 48 : 44}
        height={size === "lg" ? 48 : 44}
        className={`${box} shrink-0 object-cover ring-1 ring-border`}
      />
    );
  }
  return (
    <span
      className={`flex ${box} shrink-0 items-center justify-center bg-muted text-xs font-bold text-muted-foreground`}
      aria-hidden
    >
      ?
    </span>
  );
}

function ProgressPanel({
  title,
  body,
  wallet,
  waiting,
}: {
  title: string;
  body: string;
  wallet?: PaidAidWalletManifestSummary | null;
  waiting?: boolean;
}) {
  return (
    <div className="flex flex-col items-center px-4 py-6 text-center">
      <div className="relative mb-4">
        {wallet ? (
          <WalletIcon src={wallet.icon} alt="" size="lg" />
        ) : (
          <div className="size-12 rounded-2xl bg-muted" />
        )}
        <span className="absolute -bottom-1 -right-1 flex size-7 items-center justify-center rounded-full border-2 border-popover bg-primary">
          <Loader2Icon
            className="size-4 animate-spin text-primary-foreground"
            aria-hidden
          />
        </span>
      </div>
      <p className="text-base font-semibold text-popover-foreground">{title}</p>
      <p className="mt-2 max-w-[18rem] text-xs leading-relaxed text-muted-foreground">
        {body}
      </p>
    </div>
  );
}

function ErrorPanel({
  title,
  body,
  wallet,
}: {
  title: string;
  body: string;
  wallet?: PaidAidWalletManifestSummary | null;
}) {
  return (
    <div className="rounded-2xl border border-destructive/35 bg-destructive/10 px-4 py-4">
      <div className="flex items-start gap-3 text-left">
        {wallet ? <WalletIcon src={wallet.icon} alt="" /> : null}
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-semibold text-destructive">{title}</p>
          <p className="text-xs leading-relaxed text-destructive/90">{body}</p>
        </div>
      </div>
    </div>
  );
}

function ConnectedWalletPanel({
  accountId,
  walletName,
  walletIcon,
  networkLabel,
  statusLabel,
  copied,
  message,
  onCopy,
  onDisconnect,
  onChooseAnother,
}: {
  accountId: string;
  walletName: string | null;
  walletIcon: string | null;
  networkLabel: string;
  statusLabel: string;
  copied: boolean;
  message: string | null;
  onCopy: () => void;
  onDisconnect: () => void;
  onChooseAnother: () => void;
}) {
  return (
    <div className="space-y-4 px-1">
      <div className="flex items-center gap-3 rounded-2xl border border-border bg-muted/30 p-3">
        {walletIcon ? <WalletIcon src={walletIcon} alt="" size="md" /> : null}
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-popover-foreground">
            {walletName ?? "NEAR wallet"}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {statusLabel} · {networkLabel}
          </p>
        </div>
      </div>
      <div className="rounded-2xl border border-border bg-card p-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Account ID
        </p>
        <p className="mt-1.5 break-all font-mono text-xs leading-relaxed text-popover-foreground">
          {accountId}
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Button
          type="button"
          variant="outline"
          className="h-10 rounded-full sm:flex-1"
          onClick={onCopy}
        >
          {copied ? "Copied" : "Copy account ID"}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-10 rounded-full sm:flex-1"
          onClick={onChooseAnother}
        >
          Switch wallet
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="h-10 rounded-full text-muted-foreground sm:w-full"
          onClick={onDisconnect}
        >
          Disconnect
        </Button>
      </div>
      {message ? (
        <p className="text-center text-xs text-emerald-700">{message}</p>
      ) : null}
    </div>
  );
}
