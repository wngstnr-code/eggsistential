"use client";

import { useEffect, useMemo, useState } from "react";
import { useWallet } from "~/components/web3/WalletProvider";
import { backendFetch, backendPost } from "~/lib/backend/api";
import { hasBackendApiConfig } from "~/lib/backend/config";
import { explorerTxUrl } from "~/lib/web3/solana";
import type { DepositFlowViewModel } from "./types";

type FaucetStatusPayload = {
  success?: boolean;
  enabled?: boolean;
  cooldownSeconds?: number;
  remainingSeconds?: number;
  nextEligibleAt?: string | null;
};

type FaucetRequestPayload = {
  success: boolean;
  txHash?: string;
  cooldownSeconds?: number;
  nextEligibleAt?: string | null;
};

function normalizeError(error: unknown, fallback: string) {
