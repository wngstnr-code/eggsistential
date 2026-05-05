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
