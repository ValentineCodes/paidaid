"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { NearConnector } from "@hot-labs/near-connect";
import type { Wallet } from "@near-wallet-selector/core";
import {
  createPaidAidNearTransactionSigner,
  type PaidAidNearTransactionSigner,
} from "./paidaid-near-transaction-signer";

import type { NearPublicEnv } from "../lib/near/near-public-env";
import { nearPublicEnvToWalletRecord } from "../lib/near/near-public-env";
import { formatWalletConnectionError } from "./errors";
import { buildNearConnectorOptions } from "./near-connect-config";
import {
  connectNearWallet,
  disconnectNearWallet,
  isUserCancelledConnection,
  listAvailableWallets,
  readConnectedSession,
  signNep413WithConnectedWallet,
  type ConnectedWalletSession,
} from "./near-connect-driver";
import type {
  PaidAidNearWalletState,
  PaidAidSignedMessage,
  PaidAidSignMessageInput,
  PaidAidWalletConnectionStatus,
} from "./paidaid-near-wallet-types";

export type PaidAidNearWalletContextValue = PaidAidNearWalletState & {
  connect: (walletId?: string) => Promise<void>;
  disconnect: () => Promise<void>;
  refreshSession: () => Promise<void>;
  signMessage: (input: PaidAidSignMessageInput) => Promise<PaidAidSignedMessage>;
  getTransactionSigner: () => Promise<PaidAidNearTransactionSigner>;
  /** @deprecated Prefer {@link getTransactionSigner}. */
  getTransactionWallet: () => Promise<Wallet>;
  /** Synchronous read of the last known connected account from the connector session. */
  getSessionAccountId: () => string | null;
  clearErrors: () => void;
  /** Clears in-flight connect UI when the user dismisses the picker. */
  abandonConnectionAttempt: () => void;
  connector: NearConnector | null;
};

const defaultState: PaidAidNearWalletState = {
  status: "initializing",
  appNetworkId: "localnet",
  connectorNetwork: "testnet",
  initialized: false,
  initError: null,
  connectionError: null,
  availableWallets: [],
  selectedWalletId: null,
  selectedWalletName: null,
  accountId: null,
  publicKey: null,
  capabilities: null,
  pendingConnect: false,
  pendingDisconnect: false,
};

const PaidAidNearWalletContext = createContext<PaidAidNearWalletContextValue | null>(
  null,
);

function sessionToStatus(
  session: ConnectedWalletSession | null,
  pendingConnect: boolean,
  pendingDisconnect: boolean,
): PaidAidWalletConnectionStatus {
  if (pendingDisconnect) {
    return "disconnecting";
  }
  if (pendingConnect) {
    return "connecting";
  }
  return session ? "connected" : "disconnected";
}

function applySession(
  session: ConnectedWalletSession | null,
  pendingConnect: boolean,
  pendingDisconnect: boolean,
): Pick<
  PaidAidNearWalletState,
  | "status"
  | "selectedWalletId"
  | "selectedWalletName"
  | "accountId"
  | "publicKey"
  | "capabilities"
> {
  return {
    status: sessionToStatus(session, pendingConnect, pendingDisconnect),
    selectedWalletId: session?.walletId ?? null,
    selectedWalletName: session?.walletName ?? null,
    accountId: session?.accountId ?? null,
    publicKey: session?.publicKey ?? null,
    capabilities: session?.capabilities ?? null,
  };
}

type PaidAidNearWalletProviderProps = {
  children: ReactNode;
  nearPublicEnv: NearPublicEnv;
};

export function PaidAidNearWalletProvider({
  children,
  nearPublicEnv,
}: PaidAidNearWalletProviderProps) {
  const env = useMemo(
    () => nearPublicEnvToWalletRecord(nearPublicEnv),
    [nearPublicEnv],
  );

  const connectorOptions = useMemo(() => buildNearConnectorOptions(env), [env]);

  const [connector, setConnector] = useState<NearConnector | null>(null);
  const [state, setState] = useState<PaidAidNearWalletState>(() => ({
    ...defaultState,
    appNetworkId: connectorOptions.appNetworkId,
    connectorNetwork: connectorOptions.network ?? "testnet",
  }));
  const sessionRef = useRef<ConnectedWalletSession | null>(null);
  const connectorRef = useRef<NearConnector | null>(null);

  const syncFromConnector = useCallback(async () => {
    const active = connectorRef.current;
    if (!active) {
      sessionRef.current = null;
      setState((prev) => ({
        ...prev,
        ...applySession(null, prev.pendingConnect, prev.pendingDisconnect),
      }));
      return;
    }
    try {
      const session = await readConnectedSession(
        active,
        connectorOptions.network ?? "testnet",
        connectorOptions.appNetworkId,
      );
      sessionRef.current = session;
      setState((prev) => ({
        ...prev,
        availableWallets: listAvailableWallets(active),
        ...applySession(session, prev.pendingConnect, prev.pendingDisconnect),
        connectionError: null,
      }));
    } catch (error) {
      sessionRef.current = null;
      setState((prev) => ({
        ...prev,
        ...applySession(null, prev.pendingConnect, prev.pendingDisconnect),
        connectionError: formatWalletConnectionError(error),
      }));
    }
  }, [connectorOptions.appNetworkId, connectorOptions.network]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const { NearConnector } = await import("@hot-labs/near-connect");
        if (cancelled) {
          return;
        }
        const instance = new NearConnector(connectorOptions);
        await instance.whenManifestLoaded;
        if (cancelled) {
          return;
        }
        connectorRef.current = instance;
        setConnector(instance);

        const onSignIn = () => void syncFromConnector();
        const onSignOut = () => {
          sessionRef.current = null;
          setState((prev) => ({
            ...prev,
            ...applySession(null, false, false),
          }));
        };
        const onManifest = () => {
          setState((prev) => ({
            ...prev,
            availableWallets: listAvailableWallets(instance),
          }));
        };

        instance.on("wallet:signIn", onSignIn);
        instance.on("wallet:signOut", onSignOut);
        instance.on("selector:manifestUpdated", onManifest);
        instance.on("selector:walletsChanged", onManifest);

        setState((prev) => ({
          ...prev,
          initialized: true,
          initError: null,
          status: "disconnected",
          availableWallets: listAvailableWallets(instance),
          appNetworkId: connectorOptions.appNetworkId,
          connectorNetwork: connectorOptions.network ?? "testnet",
        }));

        await syncFromConnector();
      } catch (error) {
        if (!cancelled) {
          setState((prev) => ({
            ...prev,
            initialized: true,
            initError: formatWalletConnectionError(error),
            status: "disconnected",
          }));
        }
      }
    })();

    return () => {
      cancelled = true;
      connectorRef.current = null;
    };
  }, [connectorOptions, syncFromConnector]);

  const connect = useCallback(
    async (walletId?: string) => {
      const active = connectorRef.current;
      if (!active) {
        throw new Error("Wallet connector is still loading.");
      }
      setState((prev) => ({
        ...prev,
        pendingConnect: true,
        connectionError: null,
        status: "connecting",
      }));
      try {
        const session = await connectNearWallet(
          active,
          connectorOptions.network ?? "testnet",
          connectorOptions.appNetworkId,
          walletId,
        );
        sessionRef.current = session;
        setState((prev) => ({
          ...prev,
          pendingConnect: false,
          availableWallets: listAvailableWallets(active),
          ...applySession(sessionRef.current, false, false),
        }));
      } catch (error) {
        const cancelledConnect = isUserCancelledConnection(error);
        setState((prev) => ({
          ...prev,
          pendingConnect: false,
          connectionError: cancelledConnect
            ? "Connection cancelled."
            : formatWalletConnectionError(error),
          ...applySession(sessionRef.current, false, false),
        }));
        throw error;
      }
    },
    [connectorOptions.appNetworkId, connectorOptions.network],
  );

  const disconnect = useCallback(async () => {
    const active = connectorRef.current;
    if (!active) {
      return;
    }
    setState((prev) => ({
      ...prev,
      pendingDisconnect: true,
      status: "disconnecting",
    }));
    try {
      await disconnectNearWallet(active);
      sessionRef.current = null;
      setState((prev) => ({
        ...prev,
        pendingDisconnect: false,
        connectionError: null,
        ...applySession(null, false, false),
      }));
    } catch (error) {
      setState((prev) => ({
        ...prev,
        pendingDisconnect: false,
        connectionError: formatWalletConnectionError(error),
        ...applySession(sessionRef.current, false, false),
      }));
      throw error;
    }
  }, []);

  const signMessage = useCallback(
    async (input: PaidAidSignMessageInput) => {
      let session = sessionRef.current;
      if (!session) {
        await syncFromConnector();
        session = sessionRef.current;
      }
      if (!session) {
        throw new Error("Connect a NEAR wallet first.");
      }
      return signNep413WithConnectedWallet(
        session,
        connectorOptions.network ?? "testnet",
        connectorOptions.appNetworkId,
        input,
      );
    },
    [
      connectorOptions.appNetworkId,
      connectorOptions.network,
      syncFromConnector,
    ],
  );

  const getTransactionSigner = useCallback(async (): Promise<PaidAidNearTransactionSigner> => {
    let session = sessionRef.current;
    if (!session) {
      await syncFromConnector();
      session = sessionRef.current;
    }
    if (!session) {
      throw new Error("Connect a NEAR wallet first.");
    }
    return createPaidAidNearTransactionSigner(
      session,
      connectorOptions.network ?? "testnet",
      connectorOptions.appNetworkId,
    );
  }, [connectorOptions.appNetworkId, connectorOptions.network, syncFromConnector]);

  const getTransactionWallet = useCallback(async (): Promise<Wallet> => {
    const signer = await getTransactionSigner();
    return signer.toLegacyWallet();
  }, [getTransactionSigner]);

  const clearErrors = useCallback(() => {
    setState((prev) => ({
      ...prev,
      initError: null,
      connectionError: null,
    }));
  }, []);

  const abandonConnectionAttempt = useCallback(() => {
    setState((prev) => ({
      ...prev,
      pendingConnect: false,
      ...applySession(sessionRef.current, false, false),
    }));
  }, []);

  const getSessionAccountId = useCallback(
    () => sessionRef.current?.accountId ?? null,
    [],
  );

  const value = useMemo<PaidAidNearWalletContextValue>(
    () => ({
      ...state,
      connector,
      connect,
      disconnect,
      refreshSession: syncFromConnector,
      signMessage,
      getTransactionSigner,
      getTransactionWallet,
      getSessionAccountId,
      clearErrors,
      abandonConnectionAttempt,
    }),
    [
      state,
      connector,
      connect,
      disconnect,
      syncFromConnector,
      signMessage,
      getTransactionSigner,
      getTransactionWallet,
      getSessionAccountId,
      clearErrors,
      abandonConnectionAttempt,
    ],
  );

  return (
    <PaidAidNearWalletContext.Provider value={value}>
      {children}
    </PaidAidNearWalletContext.Provider>
  );
}

export function usePaidAidNearWallet(): PaidAidNearWalletContextValue {
  const ctx = useContext(PaidAidNearWalletContext);
  if (!ctx) {
    throw new Error("usePaidAidNearWallet must be used within PaidAidNearWalletProvider.");
  }
  return ctx;
}
