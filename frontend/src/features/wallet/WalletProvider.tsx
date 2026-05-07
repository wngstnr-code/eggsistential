"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import {
  createContext,
  useContext,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import {
  useAppKit,
  useAppKitAccount,
  useWalletInfo,
} from "@reown/appkit/react";
import { backendFetch, backendPost } from "~/lib/backend/api";
import { BACKEND_API_URL, hasBackendApiConfig } from "~/lib/backend/config";
import {
  appKit,
  hasReownProjectId,
  SOLANA_NAMESPACE,
} from "~/lib/web3/appKit";
import {
  hasSolanaConfig,
  SOLANA_CLUSTER,
  SOLANA_RPC_URL,
} from "~/lib/web3/solana";
import { readRawErrorMessage, toUserFacingWalletError } from "~/lib/errors";

type WalletContextValue = {
  account: string;
  chainIdHex: string;
  walletProviderName: string;
  canDisconnect: boolean;
  isAppChain: boolean;
  isConnecting: boolean;
  error: string;
  connectWallet: () => Promise<void>;
  disconnectWallet: () => Promise<void>;
  switchToAppChain: () => Promise<void>;
  clearWalletError: () => void;
  hasAppChainConfig: boolean;
  appChainIdHex: string;
  appChainName: string;
  backendApiUrl: string;
  hasBackendApiConfig: boolean;
  isBackendAuthenticated: boolean;
  isBackendAuthLoading: boolean;
  backendAuthError: string;
  authenticateBackend: () => Promise<boolean>;
  ensureBackendSession: () => Promise<boolean>;
  logoutBackend: () => Promise<void>;
  refreshBackendSession: () => Promise<boolean>;
};

type WalletProviderProps = {
  children: ReactNode;
};

const WalletContext = createContext<WalletContextValue | undefined>(undefined);

function readErrorMessage(error: unknown, fallback: string) {
  return readRawErrorMessage(error, fallback);
}

export function WalletProvider({ children }: WalletProviderProps) {
  const { open } = useAppKit();
  const appKitAccount = useAppKitAccount({ namespace: SOLANA_NAMESPACE });
  const { walletInfo } = useWalletInfo(SOLANA_NAMESPACE);

  const [error, setError] = useState("");
  const [isOpeningWalletModal, setIsOpeningWalletModal] = useState(false);
  const [backendAddress, setBackendAddress] = useState("");
  const [backendAuthLoading, setBackendAuthLoading] = useState(false);
  const [backendAuthError, setBackendAuthError] = useState("");
  const accountRef = useRef("");
  const backendSessionRef = useRef<{
    inFlight: Promise<boolean> | null;
    lastCheckedAt: number;
    lastResult: boolean;
    account: string;
  }>({
    inFlight: null,
    lastCheckedAt: 0,
    lastResult: false,
    account: "",
  });

  const account = appKitAccount.address || "";
  const normalizedAccount = account;
  const hasBackendConfig = hasBackendApiConfig();
  const hasBaseConfig = hasSolanaConfig() && hasReownProjectId();
  const isConnected = Boolean(appKitAccount.isConnected && account);
  const walletProviderName = walletInfo?.name || (isConnected ? "Reown AppKit" : "");
  const isConnectingWallet =
    isOpeningWalletModal ||
    appKitAccount.status === "connecting" ||
    appKitAccount.status === "reconnecting";
  const isBackendAuthenticated =
    Boolean(backendAddress) &&
    Boolean(normalizedAccount) &&
    backendAddress === normalizedAccount;

  async function connectWallet() {
    setError("");
    setBackendAuthError("");

    if (!hasReownProjectId()) {
      setError("Reown Project ID is missing. Set NEXT_PUBLIC_REOWN_PROJECT_ID first.");
      return;
    }

    setIsOpeningWalletModal(true);
    try {
      await open({ view: "Connect", namespace: SOLANA_NAMESPACE });
    } catch (connectError) {
      setError(
        toUserFacingWalletError(connectError, "Failed to open wallet modal.", {
          userRejectedMessage: "Connect wallet was canceled.",
        }),
      );
    } finally {
      setIsOpeningWalletModal(false);
    }
  }

  async function disconnectWallet() {
    setError("");
    setBackendAddress("");
    setBackendAuthError("");

    if (hasBackendConfig) {
      await logoutBackend();
    }

    try {
      await appKit?.disconnect(SOLANA_NAMESPACE);
    } catch (disconnectError) {
      setError(
        toUserFacingWalletError(disconnectError, "Failed to disconnect wallet."),
      );
    } finally {
      accountRef.current = "";
      setBackendAddress("");
      setBackendAuthError("");
    }
  }

  async function switchToAppChain() {
    if (!hasReownProjectId()) {
      setError("Reown Project ID is missing. Set NEXT_PUBLIC_REOWN_PROJECT_ID first.");
      return;
    }

    setError("");
    try {
      await open({ view: "Networks", namespace: SOLANA_NAMESPACE });
    } catch (switchError) {
      setError(
        toUserFacingWalletError(switchError, "Failed to open Solana network selector."),
      );
    }
  }

  async function refreshBackendSession() {
    if (!hasBackendConfig) {
      setBackendAddress("");
      return false;
    }

    const now = Date.now();
    const snapshot = backendSessionRef.current;
    const sameAccount = snapshot.account === normalizedAccount;
    const cooldownMs = snapshot.lastResult ? 12_000 : 4_000;

    if (snapshot.inFlight) {
      return snapshot.inFlight;
    }

    if (sameAccount && now - snapshot.lastCheckedAt < cooldownMs) {
      return snapshot.lastResult;
    }

    const task = (async () => {
      setBackendAuthLoading(true);
      try {
        const response = await backendFetch<{
          authenticated: boolean;
          address: string;
        }>("/auth/me");
        const sessionAddress = response.address || "";
        if (!sessionAddress || (normalizedAccount && sessionAddress !== normalizedAccount)) {
          setBackendAddress("");
          backendSessionRef.current = {
            inFlight: null,
            lastCheckedAt: Date.now(),
            lastResult: false,
            account: normalizedAccount,
          };
          return false;
        }

        setBackendAddress(sessionAddress);
        setBackendAuthError("");
        backendSessionRef.current = {
          inFlight: null,
          lastCheckedAt: Date.now(),
          lastResult: true,
          account: normalizedAccount,
        };
        return true;
      } catch {
        setBackendAddress("");
        backendSessionRef.current = {
          inFlight: null,
          lastCheckedAt: Date.now(),
          lastResult: false,
          account: normalizedAccount,
        };
        return false;
      } finally {
        setBackendAuthLoading(false);
      }
    })();

    backendSessionRef.current = {
      ...backendSessionRef.current,
      inFlight: task,
      account: normalizedAccount,
    };

    return task;
  }

  async function authenticateBackend() {
    if (!hasBackendConfig) {
      setBackendAuthError(
        "Backend config is incomplete. Set NEXT_PUBLIC_BACKEND_API_URL first.",
      );
      return false;
    }

    if (!isConnected || !account) {
      setBackendAuthError("Connect wallet first before signing in to backend.");
      return false;
    }

    setBackendAuthLoading(true);
    setBackendAuthError("");

    try {
      await backendPost<{ success: boolean; address: string }>("/auth/minipay", {
        address: account,
        walletProvider: "minipay",
      });

      setBackendAddress(account);
      backendSessionRef.current = {
        inFlight: null,
        lastCheckedAt: Date.now(),
        lastResult: true,
        account,
      };
      return true;
    } catch (authError) {
      setBackendAddress("");
      backendSessionRef.current = {
        inFlight: null,
        lastCheckedAt: Date.now(),
        lastResult: false,
        account: normalizedAccount,
      };
      setBackendAuthError(
        toUserFacingWalletError(
          authError,
          readErrorMessage(authError, "Failed to authenticate Solana wallet with backend."),
        ),
      );
      return false;
    } finally {
      setBackendAuthLoading(false);
    }
  }

  async function ensureBackendSession() {
    if (!hasBackendConfig) {
      return false;
    }
    if (isBackendAuthenticated) {
      return true;
    }

    const hasExistingSession = await refreshBackendSession();
    if (hasExistingSession) {
      return true;
    }

    return authenticateBackend();
  }

  async function logoutBackend() {
    if (!hasBackendConfig) {
      setBackendAddress("");
      return;
    }

    try {
      await backendPost<{ success: boolean }>("/auth/logout");
    } catch {
      // Ignore logout failures on local dev; frontend state is still cleared.
    } finally {
      setBackendAddress("");
      setBackendAuthError("");
      setBackendAuthLoading(false);
    }
  }

  const refreshBackendSessionEvent = useEffectEvent(refreshBackendSession);

  useEffect(() => {
    if (accountRef.current && accountRef.current !== account) {
      setBackendAddress("");
      setBackendAuthError("");
      backendSessionRef.current = {
        inFlight: null,
        lastCheckedAt: 0,
        lastResult: false,
        account,
      };
    }

    if (!account) {
      setError("");
      setBackendAddress("");
      setBackendAuthError("");
    }

    accountRef.current = account;
  }, [account]);

  useEffect(() => {
    if (!hasBackendConfig || !isConnected || !account) {
      setBackendAddress("");
      return;
    }

    void refreshBackendSessionEvent();
  }, [account, hasBackendConfig, isConnected]);

  const value: WalletContextValue = {
    account,
    chainIdHex: SOLANA_CLUSTER,
    walletProviderName,
    canDisconnect: true,
    isAppChain: hasBaseConfig,
    isConnecting: isConnectingWallet,
    error,
    connectWallet,
    disconnectWallet,
    switchToAppChain,
    clearWalletError: () => setError(""),
    hasAppChainConfig: hasBaseConfig,
    appChainIdHex: SOLANA_CLUSTER,
    appChainName: `Solana ${SOLANA_CLUSTER}`,
    backendApiUrl: BACKEND_API_URL,
    hasBackendApiConfig: hasBackendConfig,
    isBackendAuthenticated,
    isBackendAuthLoading: backendAuthLoading,
    backendAuthError,
    authenticateBackend,
    ensureBackendSession,
    logoutBackend,
    refreshBackendSession,
  };

  void SOLANA_RPC_URL;

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const value = useContext(WalletContext);
  if (!value) {
    throw new Error("useWallet must be used inside WalletProvider.");
  }
  return value;
}
