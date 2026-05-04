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
