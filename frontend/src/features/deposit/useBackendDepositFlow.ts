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
  if (error && typeof error === "object" && "message" in error) {
    const message = String((error as { message?: string }).message || "").trim();
    if (message) return message;
  }
  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }
  return fallback;
}

function parseAmount(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function useBackendDepositFlow(): DepositFlowViewModel {
  const {
    account,
    isAppChain,
    ensureBackendSession,
    isBackendAuthenticated,
  } = useWallet();
  const [amount, setAmount] = useState("10");
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isFaucetBusy, setIsFaucetBusy] = useState(false);
  const [isDepositBusy, setIsDepositBusy] = useState(false);
  const [isWithdrawBusy, setIsWithdrawBusy] = useState(false);
  const [faucetEnabled, setFaucetEnabled] = useState(false);
  const [faucetCooldownSeconds, setFaucetCooldownSeconds] = useState(0);
  const [faucetTxHash, setFaucetTxHash] = useState("");

  const isConnected = Boolean(account);
  const hasBackendConfig = hasBackendApiConfig();
  const canUseBackend = isConnected && isAppChain && hasBackendConfig;
  const parsedAmount = parseAmount(amount);

  useEffect(() => {
    if (!canUseBackend || !isBackendAuthenticated) return;

    let cancelled = false;

    void backendFetch<FaucetStatusPayload>("/api/faucet/status")
      .then((status) => {
        if (cancelled) return;
        setFaucetEnabled(Boolean(status.enabled));
        setFaucetCooldownSeconds(Number(status.remainingSeconds || 0));
      })
      .catch(() => {
        if (cancelled) return;
        setFaucetEnabled(false);
        setFaucetCooldownSeconds(0);
      });

    return () => {
      cancelled = true;
    };
  }, [canUseBackend, isBackendAuthenticated]);
