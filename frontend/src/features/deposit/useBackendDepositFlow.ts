"use client";

import { useEffect, useMemo, useState } from "react";
import { useAppKitProvider } from "@reown/appkit/react";
import { Connection, Transaction } from "@solana/web3.js";
import { useWallet } from "~/features/wallet/WalletProvider";
import { backendFetch, backendPost } from "~/lib/backend/api";
import { hasBackendApiConfig } from "~/lib/backend/config";
import { SOLANA_NAMESPACE } from "~/lib/web3/appKit";
import { explorerTxUrl, SOLANA_RPC_URL } from "~/lib/web3/solana";
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
  unsignedTx?: string;
  cooldownSeconds?: number;
  nextEligibleAt?: string | null;
};

type VaultStatusPayload = {
  success: boolean;
  walletBalance?: string;
  availableBalance?: string;
  lockedBalance?: string;
};

type VaultTxPayload = {
  success: boolean;
  unsignedTx: string;
  amount?: string;
  amountUnits?: string;
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

function base64ToBytes(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function useBackendDepositFlow(): DepositFlowViewModel {
  const { walletProvider } = useAppKitProvider<unknown>(SOLANA_NAMESPACE);
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
  const [depositTxHash, setDepositTxHash] = useState("");
  const [withdrawTxHash, setWithdrawTxHash] = useState("");
  const [walletBalanceDisplay, setWalletBalanceDisplay] = useState("-");
  const [availableBalanceDisplay, setAvailableBalanceDisplay] = useState("-");
  const [lockedBalanceDisplay, setLockedBalanceDisplay] = useState("-");

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

  useEffect(() => {
    if (!canUseBackend || !isBackendAuthenticated) return;
    let cancelled = false;

    void backendFetch<VaultStatusPayload>("/api/vault/status")
      .then((status) => {
        if (cancelled) return;
        setWalletBalanceDisplay(String(status.walletBalance || "-"));
        setAvailableBalanceDisplay(String(status.availableBalance || "-"));
        setLockedBalanceDisplay(String(status.lockedBalance || "-"));
      })
      .catch(() => {
        if (cancelled) return;
        setWalletBalanceDisplay("-");
        setAvailableBalanceDisplay("-");
        setLockedBalanceDisplay("-");
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
    if (!walletProvider) {
      setErrorMessage("Solana wallet provider is not ready yet.");
      return false;
    }

    const authed = await ensureBackendSession();
    if (!authed) {
      setErrorMessage("Backend session failed. Reconnect wallet and try again.");
      return false;
    }

    return true;
  }

  async function sendUnsignedTx(unsignedTx: string) {
    const wallet = walletProvider as {
      sendTransaction: (
        transaction: Transaction,
        connection: Connection,
      ) => Promise<string>;
    };
    const tx = Transaction.from(base64ToBytes(unsignedTx));
    const connection = new Connection(SOLANA_RPC_URL, "confirmed");
    const txHash = await wallet.sendTransaction(tx, connection);
    await connection.confirmTransaction(txHash, "confirmed");
    return txHash;
  }

  async function refreshVaultStatus() {
    const status = await backendFetch<VaultStatusPayload>("/api/vault/status");
    setWalletBalanceDisplay(String(status.walletBalance || "-"));
    setAvailableBalanceDisplay(String(status.availableBalance || "-"));
    setLockedBalanceDisplay(String(status.lockedBalance || "-"));
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
      setStatusMessage("Preparing deposit transaction...");
      const payload = await backendPost<VaultTxPayload>("/api/vault/deposit", {
        amount: parsedAmount.toString(),
      });
      if (!payload?.unsignedTx) {
        throw new Error("Backend did not return deposit transaction.");
      }
      setStatusMessage("Sign deposit in wallet...");
      const txHash = await sendUnsignedTx(payload.unsignedTx);
      setDepositTxHash(txHash);
      setStatusMessage("Deposit confirmed on-chain.");
      await refreshVaultStatus();
      setAmount("10");
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(normalizeError(error, "Deposit failed."));
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
      setStatusMessage("Preparing withdraw transaction...");
      const payload = await backendPost<VaultTxPayload>("/api/vault/withdraw", {
        amount: parsedAmount.toString(),
      });
      if (!payload?.unsignedTx) {
        throw new Error("Backend did not return withdraw transaction.");
      }
      setStatusMessage("Sign withdraw in wallet...");
      const txHash = await sendUnsignedTx(payload.unsignedTx);
      setWithdrawTxHash(txHash);
      setStatusMessage("Withdraw confirmed on-chain.");
      await refreshVaultStatus();
      setAmount("10");
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(normalizeError(error, "Withdraw failed."));
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
      const unsignedTx = String(result.unsignedTx || "");
      if (!unsignedTx) {
        throw new Error("Backend did not return faucet transaction.");
      }
      setStatusMessage("Sign faucet claim in wallet...");
      const txHash = await sendUnsignedTx(unsignedTx);
      setFaucetTxHash(txHash);
      setFaucetCooldownSeconds(Number(result.cooldownSeconds || status.cooldownSeconds || 0));
      setStatusMessage("Faucet claim confirmed on-chain.");
      await refreshVaultStatus();
    } catch (error) {
      setErrorMessage(
        normalizeError(error, "Faucet request failed."),
      );
    } finally {
      setIsFaucetBusy(false);
    }
  }

  return {
    source: "backend",
    amount,
    setAmount,
    statusMessage,
    errorMessage,
    isConnected,
    isAppChain,
    canTransact: canUseBackend,
    hasValidContracts: hasBackendConfig,
    usdcAddress: process.env.NEXT_PUBLIC_USDC_MINT || "",
    vaultAddress: process.env.NEXT_PUBLIC_VAULT_ADDRESS || "",
    walletBalanceDisplay,
    allowanceDisplay: "-",
    availableBalanceDisplay,
    lockedBalanceDisplay,
    isWalletBalanceFetching: false,
    isAllowanceFetching: false,
    isVaultBalanceFetching: false,
    needsApproval: false,
    approveTxHash: "",
    approveTxUrl: "",
    depositTxHash,
    depositTxUrl: explorerTxUrl(depositTxHash),
    withdrawTxHash,
    withdrawTxUrl: explorerTxUrl(withdrawTxHash),
    faucetTxHash,
    faucetTxUrl: explorerTxUrl(faucetTxHash),
    isApproveBusy: false,
    isDepositBusy,
    isWithdrawBusy,
    isFaucetBusy,
    disableApproveButton: true,
    disableDepositButton: !canUseBackend || isDepositBusy || isWithdrawBusy || isFaucetBusy,
    disableWithdrawButton: !canUseBackend || isDepositBusy || isWithdrawBusy || isFaucetBusy,
    disableFaucetButton:
      !canUseBackend ||
      !isBackendAuthenticated ||
      !faucetEnabled ||
      faucetCooldownSeconds > 0 ||
      isDepositBusy ||
      isWithdrawBusy ||
      isFaucetBusy,
    onApprove: async () => {},
    onDeposit,
    onWithdraw,
    onRequestFaucet,
    faucetCooldownSeconds,
    configMessage,
  };
}
