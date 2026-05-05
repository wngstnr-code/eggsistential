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

  const configMessage = useMemo(() => {
    if (!hasBackendConfig) {
      return "Backend mode is enabled but NEXT_PUBLIC_BACKEND_API_URL is not set.";
    }
    if (!isConnected) {
      return "Connect a Solana wallet to manage vault balance.";
    }
    if (!isAppChain) {
      return "Solana RPC config is missing. Check frontend/.env.";
    }
    if (!isBackendAuthenticated) {
      return "Wallet connected. Backend session will sync before requests.";
    }
    return "Solana backend mode aktif. Deposit/withdraw menunggu endpoint program dari backend.";
  }, [hasBackendConfig, isAppChain, isBackendAuthenticated, isConnected]);

  async function ensureReady() {
    setErrorMessage("");

    if (!hasBackendConfig) {
      setErrorMessage("Set NEXT_PUBLIC_BACKEND_API_URL first.");
      return false;
    }
    if (!isConnected) {
      setErrorMessage("Connect Solana wallet first.");
      return false;
    }
    if (!isAppChain) {
      setErrorMessage("Solana RPC config is missing.");
      return false;
    }

    const authed = await ensureBackendSession();
    if (!authed) {
      setErrorMessage("Backend session failed. Reconnect wallet and try again.");
      return false;
    }

    return true;
  }

  async function onDeposit() {
    setIsDepositBusy(true);
    setStatusMessage("");
    try {
      const ready = await ensureReady();
      if (!ready) return;
      if (!parsedAmount) {
        setErrorMessage("Masukkan amount USDC yang valid.");
        return;
      }

      setErrorMessage(
        "Deposit Solana belum tersambung. Butuh endpoint backend untuk build/send transaction ke vault program.",
      );
    } finally {
      setIsDepositBusy(false);
    }
  }

  async function onWithdraw() {
    setIsWithdrawBusy(true);
    setStatusMessage("");
    try {
      const ready = await ensureReady();
      if (!ready) return;
      if (!parsedAmount) {
        setErrorMessage("Masukkan amount USDC yang valid.");
        return;
      }

      setErrorMessage(
        "Withdraw Solana belum tersambung. Butuh endpoint backend untuk vault withdraw instruction.",
      );
    } finally {
      setIsWithdrawBusy(false);
    }
  }

  async function onRequestFaucet() {
    setIsFaucetBusy(true);
    setStatusMessage("");
    setErrorMessage("");

    try {
      const ready = await ensureReady();
      if (!ready) return;

      const status = await backendFetch<FaucetStatusPayload>("/api/faucet/status");
      setFaucetEnabled(Boolean(status.enabled));
      setFaucetCooldownSeconds(Number(status.remainingSeconds || 0));

      if (!status.enabled) {
        setErrorMessage(
          "Faucet backend belum aktif. Isi program/service faucet Solana di backend dulu.",
        );
        return;
      }
      if (Number(status.remainingSeconds || 0) > 0) {
        setErrorMessage(`Tunggu ${status.remainingSeconds} detik sebelum request faucet lagi.`);
        return;
      }

      const result = await backendPost<FaucetRequestPayload>("/api/faucet/request");
