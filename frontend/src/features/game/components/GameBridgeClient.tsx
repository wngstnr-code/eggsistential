"use client";

import { useEffect, useRef } from "react";
import { useAppKitProvider } from "@reown/appkit/react";
import { Connection, Transaction, VersionedTransaction } from "@solana/web3.js";
import { useWallet } from "~/features/wallet/WalletProvider";
import { backendFetch } from "~/lib/backend/api";
import { SOLANA_NAMESPACE } from "~/lib/web3/appKit";
import { SOLANA_RPC_URL } from "~/lib/web3/solana";
import {
  initializeSocket,
  emitGameStart,
  emitGameMove,
  emitGameCrash,
  emitGameCashout,
  onGameEvent,
  isSocketConnected,
  type GameStartedPayload,
  type GameCashoutResultPayload,
  type GameCrashedPayload,
} from "~/lib/web3/socket";

type GameBridgeClientProps = {
  backgroundMode?: boolean;
};

type ActiveBackendSessionPayload = {
  hasActiveGame: boolean;
  session?: {
    session_id?: string;
    onchain_session_id?: string;
    stake_amount?: number | string;
    created_at?: string;
  } | null;
};

type PendingSettlementSession = {
  session_id?: string;
  onchain_session_id?: string;
  resolution?: {
    sessionId?: string;
  };
  payload?: {
    sessionId?: string;
  };
};

type PendingSettlementsPayload = {
  hasPending: boolean;
  pendingSettlements: PendingSettlementSession[];
};

type VaultStatusPayload = {
  walletBalance?: string | number;
  availableBalance?: string | number;
  lockedBalance?: string | number;
};

type PassportIssueSignaturePayload = {
  success: boolean;
  unsignedTx: string;
  claim?: {
    tier?: number;
    expiry?: string;
  };
  signatureExpiry?: number;
  eligibility?: {
    tier?: number;
  };
};

type StartSessionPayload = {
  success: boolean;
  onchainSessionId?: string;
  unsignedTx?: string | null;
  reusedActiveSession?: boolean;
};

const SOLANA_PROGRAM_FLOW_PENDING =
  "Solana program flow belum tersambung. Butuh endpoint backend/program untuk build dan submit transaction.";

function pendingProgramError(action: string) {
  return new Error(`${action}: ${SOLANA_PROGRAM_FLOW_PENDING}`);
}

function normalizeHistoryLimit(limit: number | undefined, fallback = 3) {
  const parsed = Number(limit);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(Math.floor(parsed), 20));
}

function normalizeStakeInput(value: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("Stake amount is invalid.");
  }
  return parsed;
}

function emitPlayBlocker(blocker: ChickenBridgePlayBlocker) {
  window.dispatchEvent(
    new CustomEvent("chicken:play-blocker", {
      detail: blocker,
    }),
  );
}

async function fetchActiveBackendSession() {
  try {
    return await backendFetch<ActiveBackendSessionPayload>("/api/game/active");
  } catch {
    return {
      hasActiveGame: false,
      session: null,
    };
  }
}

async function fetchPendingSettlements() {
  try {
    return await backendFetch<PendingSettlementsPayload>("/api/game/pending-settlement");
  } catch {
    return {
      hasPending: false,
      pendingSettlements: [],
    };
  }
}

function toBase64Bytes(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function readUnknownErrorMessage(error: unknown) {
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message || "").trim();
  }
  if (typeof error === "string") return error.trim();
  return "";
}

async function readSendTransactionLogs(error: unknown, connection: Connection) {
  if (!error || typeof error !== "object") return null;

  const candidate = error as {
    logs?: unknown;
    getLogs?: (connection?: Connection) => Promise<string[] | null> | string[] | null;
  };

  if (Array.isArray(candidate.logs)) {
    return candidate.logs.map(String);
  }

  if (typeof candidate.getLogs === "function") {
    try {
      const logs = await candidate.getLogs(connection);
      return Array.isArray(logs) ? logs.map(String) : null;
    } catch {
      return null;
    }
  }

  return null;
}

function isBlockhashError(message: string, logs: string[] | null) {
  const haystack = [message, ...(logs || [])].join("\n").toLowerCase();
  return haystack.includes("blockhash not found") || haystack.includes("blockhash");
}

function isUserRejectedWalletError(message: string) {
  const lower = message.toLowerCase();
  return (
    lower.includes("user rejected") ||
    lower.includes("rejected the request") ||
    lower.includes("user denied") ||
    lower.includes("rejected by user")
  );
}

function isSolFeeBalanceError(message: string, logs: string[] | null) {
  const haystack = [message, ...(logs || [])].join("\n").toLowerCase();
  return (
    haystack.includes("attempt to debit an account but found no record of a prior credit") ||
    haystack.includes("insufficient funds for fee") ||
    haystack.includes("insufficient lamports")
  );
}

export function GameBridgeClient({
  backgroundMode = false,
}: GameBridgeClientProps) {
  const { walletProvider } = useAppKitProvider<unknown>(SOLANA_NAMESPACE);
  const {
    account,
    isAppChain,
    hasBackendApiConfig,
    ensureBackendSession,
    refreshBackendSession,
  } = useWallet();

  const pendingUnsubscribersRef = useRef<Array<() => void>>([]);
  const lastSettleSweepAtRef = useRef(0);
  const settleSweepBusyRef = useRef(false);

  useEffect(() => {
    if (backgroundMode) return;

    document.documentElement.classList.add("play-scroll-lock");
    document.body.classList.add("play-scroll-lock");

    return () => {
      document.documentElement.classList.remove("play-scroll-lock");
      document.body.classList.remove("play-scroll-lock");
    };
  }, [backgroundMode]);

  useEffect(() => {
    if (backgroundMode) {
      window.__CHICKEN_GAME_BRIDGE__ = {
        backgroundMode: true,
        loadAvailableBalance: async () => 0,
        loadDepositBalances: async () => ({
          walletBalance: 0,
          availableBalance: 0,
          lockedBalance: 0,
          allowance: 0,
        }),
        loadLeaderboard: async () => ({
          leaderboard: [],
          walletAddress: "",
        }),
        loadPlayerStats: async () => ({
          wallet_address: "",
          total_games: 0,
          total_wins: 0,
          total_losses: 0,
          total_profit: 0,
          created_at: null,
        }),
        loadGameHistory: async (limit = 3) => ({
          sessions: [],
          total: 0,
          limit,
          offset: 0,
        }),
        loadPlayerTransactions: async (limit = 3) => ({
          transactions: [],
          total: 0,
          limit,
          offset: 0,
        }),
        getWalletAddress: () => "",
        openDeposit: (presetAmount?: number) => {
          window.dispatchEvent(
            new CustomEvent("chicken:open-deposit-modal", {
              detail: { amount: presetAmount },
            }),
          );
        },
        depositToVault: async () => {
          throw pendingProgramError("Deposit");
        },
        startBet: async () => {
          throw pendingProgramError("Start bet");
        },
        sendMove: () => {},
        cashOut: async () => {
          throw pendingProgramError("Cash out");
        },
        crash: async () => {
          throw pendingProgramError("Crash settlement");
        },
        autoSettlePending: async () => false,
        getPlayBlocker: async () => ({ kind: "none" }),
        resolvePlayBlocker: async () => false,
        getPassportStatus: async () => ({
          walletAddress: "",
          eligibility: {
            eligible: false,
            tier: 0,
            reason: "Background mode.",
            stats: {
              runsCompleted: 0,
              bestHops: 0,
              averageHops: 0,
              successfulCashouts: 0,
              consistencyScore: 0,
              highestCheckpointCashedOut: 0,
              checkpointCashouts: {},
            },
          },
          passport: {
            configured: false,
            valid: false,
            tier: 0,
            issuedAt: 0,
            expiry: 0,
            revoked: false,
          },
          progression: {
            currentTier: 0,
            currentTierLabel: "Rookie",
            nextTier: 1,
            nextTierLabel: "Runner",
            progressLabel: "Passport status is unavailable in background mode.",
            percentToNextTier: 0,
            requirements: [],
            stats: {
              runsCompleted: 0,
              bestHops: 0,
              averageHops: 0,
              successfulCashouts: 0,
              consistencyScore: 0,
              highestCheckpointCashedOut: 0,
              checkpointCashouts: {},
            },
          },
        }),
        claimPassport: async () => {
          throw pendingProgramError("Claim passport");
        },
      };

      return () => {
        delete window.__CHICKEN_GAME_BRIDGE__;
      };
    }

    async function requireBackendWalletSession() {
      if (!account) {
        throw new Error("Connect Solana wallet first.");
      }
      if (!isAppChain) {
        throw new Error("Solana RPC config is missing. Check frontend/.env.");
      }
      if (!hasBackendApiConfig) {
        throw new Error("Frontend backend config is incomplete.");
      }

      const authOkay = await ensureBackendSession();
      if (!authOkay) {
        throw new Error("Backend session is not active yet. Connect wallet again.");
      }

      return account;
    }

    async function getPlayBlocker(): Promise<ChickenBridgePlayBlocker> {
      if (!account || !isAppChain || !hasBackendApiConfig) {
        return { kind: "none" };
      }

      const authOkay = await refreshBackendSession();
      if (!authOkay) {
        return { kind: "none" };
      }

      const [pending, activeBackendSession] = await Promise.all([
        fetchPendingSettlements(),
        fetchActiveBackendSession(),
      ]);

      if (pending.hasPending && pending.pendingSettlements.length > 0) {
        const pendingCount = pending.pendingSettlements.length;
        const firstPending = pending.pendingSettlements[0];
        return {
          kind: "pending_settlement",
          message:
            pendingCount > 1
              ? `${pendingCount} PREV BETS NEED SETTLEMENT`
              : "PREV BET NEEDS SETTLEMENT",
          actionLabel: "END NOW",
          onchainSessionId: String(
            firstPending?.onchain_session_id ||
              firstPending?.resolution?.sessionId ||
              firstPending?.payload?.sessionId ||
              "",
          ),
          pendingCount,
        };
      }

      if (activeBackendSession.hasActiveGame) {
        return {
          kind: "active_previous",
          message: "PREV BET STILL NOT END",
          actionLabel: "END NOW",
          onchainSessionId: String(
            activeBackendSession.session?.onchain_session_id || "",
          ),
        };
      }

      return { kind: "none" };
    }

    async function refreshPlayBlockerStatus() {
      const blocker = await getPlayBlocker();
      emitPlayBlocker(blocker);
      return blocker;
    }

    async function submitAllPendingSettlements() {
      const pending = await fetchPendingSettlements();
      if (!pending.hasPending || pending.pendingSettlements.length === 0) {
        return 0;
      }

      let settledCount = 0;
      for (const session of pending.pendingSettlements) {
        const sessionId = String(session?.session_id || "").trim();
        if (!sessionId) continue;
        const response = await backendFetch<{ success: boolean; txHash?: string }>(
          "/api/game/submit-settlement",
          {
            method: "POST",
            body: JSON.stringify({ sessionId }),
          },
        );
        if (response?.success) {
          settledCount += 1;
        }
      }

      return settledCount;
    }

    async function settlePendingSilently() {
      const now = Date.now();
      if (settleSweepBusyRef.current) return;
      if (now - lastSettleSweepAtRef.current < 1800) return;
      settleSweepBusyRef.current = true;
      lastSettleSweepAtRef.current = now;
      try {
        await submitAllPendingSettlements();
      } catch {
      } finally {
        settleSweepBusyRef.current = false;
      }
    }

    async function submitSettlementForSession(sessionId?: string) {
      const normalized = String(sessionId || "").trim();
      if (!normalized) return false;
      try {
        const response = await backendFetch<{ success: boolean; txHash?: string }>(
          "/api/game/submit-settlement",
          {
            method: "POST",
            body: JSON.stringify({ sessionId: normalized }),
          },
        );
        return Boolean(response?.success);
      } catch {
        return false;
      }
    }

    function toFiniteAmount(value: string | number | undefined) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }

    async function readVaultAvailableBalance() {
      await settlePendingSilently();
      const snapshot = await backendFetch<VaultStatusPayload>("/api/vault/status");
      return toFiniteAmount(snapshot?.availableBalance);
    }

    async function waitForAvailableBalanceChange(previous: number, timeoutMs = 2500) {
      const startedAt = Date.now();
      let latest = previous;
      while (Date.now() - startedAt < timeoutMs) {
        try {
          latest = await readVaultAvailableBalance();
          if (Math.abs(latest - previous) > 0.000001) {
            return latest;
          }
        } catch {}
        await new Promise((resolve) => window.setTimeout(resolve, 220));
      }
      return latest;
    }

    async function ensureGameSocket() {
      if (!account) {
        throw new Error("Connect Solana wallet first.");
      }
      if (isSocketConnected()) return;
      await initializeSocket(account, walletProvider?.constructor?.name);
      if (!isSocketConnected()) {
        throw new Error("Socket connection is not ready.");
      }
    }

    async function sendUnsignedLegacyTransaction(unsignedTx: string) {
      if (!walletProvider) {
        throw new Error("Solana wallet provider is not ready yet.");
      }
      const wallet = walletProvider as {
        sendTransaction: (
          transaction: Transaction,
          connection: Connection,
        ) => Promise<string>;
      };
      const tx = Transaction.from(toBase64Bytes(unsignedTx));
      const connection = new Connection(SOLANA_RPC_URL, "confirmed");
      const latestBlockhash = await connection.getLatestBlockhash("confirmed");
      tx.recentBlockhash = latestBlockhash.blockhash;
      tx.lastValidBlockHeight = latestBlockhash.lastValidBlockHeight;

      try {
        const txHash = await wallet.sendTransaction(tx, connection);
        await connection.confirmTransaction(
          {
            signature: txHash,
            blockhash: latestBlockhash.blockhash,
            lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
          },
          "confirmed",
        );
        return txHash;
      } catch (error) {
        const message = readUnknownErrorMessage(error);
        const logs = await readSendTransactionLogs(error, connection);

        if (isUserRejectedWalletError(message)) {
          throw new Error("Start bet was canceled in wallet.");
        }

        if (isSolFeeBalanceError(message, logs)) {
          throw new Error("Wallet needs SOL for network fees before starting a bet.");
        }

        if (isBlockhashError(message, logs)) {
          throw new Error("Transaction expired. Please try again.");
        }

        console.warn("Solana wallet transaction failed", {
          message,
          logs,
        });

        throw error;
      }
    }

    function waitForSocketResult<T>(
      event: "game:started" | "game:cashout_result" | "game:crashed",
      emitAction: () => boolean,
      timeoutMs = 12000,
    ): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        let settled = false;
        const cleanups: Array<() => void> = [];

        const finalize = () => {
          while (cleanups.length) {
            const dispose = cleanups.pop();
            if (dispose) dispose();
          }
        };

        const onSuccess = (payload: T) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeoutId);
          finalize();
          resolve(payload);
        };

        const onError = (payload: { message: string }) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeoutId);
          finalize();
          reject(new Error(String(payload?.message || "Gateway error")));
        };

        cleanups.push(onGameEvent(event, onSuccess as never));
        cleanups.push(onGameEvent("game:error", onError));
        pendingUnsubscribersRef.current.push(...cleanups);

        const timeoutId = window.setTimeout(() => {
          if (settled) return;
          settled = true;
          finalize();
          reject(new Error(`Timeout waiting for ${event}`));
        }, timeoutMs);

        if (!emitAction()) {
          if (settled) return;
          settled = true;
          clearTimeout(timeoutId);
          finalize();
          reject(new Error(`Failed to emit ${event}`));
        }
      });
    }

    window.__CHICKEN_GAME_BRIDGE__ = {
      backgroundMode: false,
      loadAvailableBalance: async () => {
        if (!account || !hasBackendApiConfig) return 0;
        await requireBackendWalletSession();
        return readVaultAvailableBalance();
      },
      loadDepositBalances: async () => {
        await requireBackendWalletSession();
        const snapshot = await backendFetch<VaultStatusPayload>("/api/vault/status");
        return {
          walletBalance: toFiniteAmount(snapshot?.walletBalance),
          availableBalance: toFiniteAmount(snapshot?.availableBalance),
          lockedBalance: toFiniteAmount(snapshot?.lockedBalance),
          allowance: 0,
        };
      },
      loadLeaderboard: async () => {
        if (!hasBackendApiConfig) {
          throw new Error("Frontend backend config is incomplete.");
        }

        const payload = await backendFetch<{
          leaderboard?: ChickenBridgeLeaderboardEntry[];
        }>("/api/leaderboard");

        return {
          leaderboard: Array.isArray(payload?.leaderboard)
            ? payload.leaderboard
            : [],
          walletAddress: account || "",
        };
      },
      loadPlayerStats: async () => {
        await requireBackendWalletSession();
        return backendFetch<ChickenBridgePlayerStats>("/api/player/stats");
      },
      loadGameHistory: async (limit = 3) => {
        await requireBackendWalletSession();

        const safeLimit = normalizeHistoryLimit(limit);
        const payload = await backendFetch<ChickenBridgeGameHistoryPayload>(
          `/api/game/history?limit=${safeLimit}&offset=0`,
        );

        return {
          sessions: Array.isArray(payload?.sessions) ? payload.sessions : [],
          total: Number(payload?.total || 0),
          limit: Number(payload?.limit || safeLimit),
          offset: Number(payload?.offset || 0),
        };
      },
      loadPlayerTransactions: async (limit = 3) => {
        await requireBackendWalletSession();

        const safeLimit = normalizeHistoryLimit(limit);
        const payload = await backendFetch<ChickenBridgePlayerTransactionsPayload>(
          `/api/player/transactions?limit=${safeLimit}&offset=0`,
        );

        return {
          transactions: Array.isArray(payload?.transactions)
            ? payload.transactions
            : [],
          total: Number(payload?.total || 0),
          limit: Number(payload?.limit || safeLimit),
          offset: Number(payload?.offset || 0),
        };
      },
      getWalletAddress: () => account || "",
      openDeposit: (presetAmount?: number) => {
        window.dispatchEvent(
          new CustomEvent("chicken:open-deposit-modal", {
            detail: { amount: presetAmount },
          }),
        );
      },
      depositToVault: async () => {
        await requireBackendWalletSession();
        throw pendingProgramError("Deposit");
      },
      startBet: async (stakeInput: number) => {
        await requireBackendWalletSession();
        const stake = normalizeStakeInput(stakeInput);
        const beforeAvailable = await readVaultAvailableBalance().catch(() => 0);
        const startSession = await backendFetch<StartSessionPayload>(
          "/api/game/start-session",
          {
            method: "POST",
            body: JSON.stringify({ stake }),
          },
        );
        if (!startSession?.success || !startSession?.onchainSessionId) {
          throw new Error("Backend failed to prepare start session.");
        }
        if (startSession.unsignedTx) {
          await sendUnsignedLegacyTransaction(startSession.unsignedTx);
        }
        await ensureGameSocket();
        const started = await waitForSocketResult<GameStartedPayload>(
          "game:started",
          () => emitGameStart(stake, startSession.onchainSessionId),
        );
        const availableBalance = await waitForAvailableBalanceChange(beforeAvailable).catch(
          () => beforeAvailable,
        );
        return {
          sessionId: String(started.sessionId || ""),
          onchainSessionId: String(started.onchainSessionId || ""),
          stake: Number(started.stake || stake),
          availableBalance,
          txHash: "socket-game-started",
        };
      },
      sendMove: (direction: string) => {
        if (isSocketConnected()) {
          emitGameMove(direction);
        }
      },
      cashOut: async () => {
        await requireBackendWalletSession();
        const beforeAvailable = await readVaultAvailableBalance().catch(() => 0);
        await ensureGameSocket();
        const result = await waitForSocketResult<GameCashoutResultPayload>(
          "game:cashout_result",
          () => emitGameCashout(),
        );
        if (!result.settlementTxHash) {
          await submitSettlementForSession(result.sessionId);
        }
        const availableBalance = await waitForAvailableBalanceChange(beforeAvailable).catch(
          () => beforeAvailable,
        );
        return {
          sessionId: String(result.sessionId || ""),
          onchainSessionId: String(result.onchainSessionId || ""),
          availableBalance,
          txHash: String(result.settlementTxHash || ""),
          resolution: result.resolution as ChickenBridgeSettlementResolution,
          signature: String(result.signature || result.settlementSignature || ""),
          multiplier: Number(result.multiplier || 0),
          payoutAmount: Number(result.payoutAmount || 0),
          profit: Number(result.profit || 0),
        };
      },
      crash: async (reason?: string) => {
        await requireBackendWalletSession();
        const beforeAvailable = await readVaultAvailableBalance().catch(() => 0);
        await ensureGameSocket();
        const result = await waitForSocketResult<GameCrashedPayload>("game:crashed", () =>
          emitGameCrash(),
        );
        if (!result.settlementTxHash) {
          await submitSettlementForSession(result.sessionId);
        }
        const availableBalance = await waitForAvailableBalanceChange(beforeAvailable).catch(
          () => beforeAvailable,
        );
        return {
          sessionId: String(result.sessionId || ""),
          onchainSessionId: String(result.onchainSessionId || ""),
          availableBalance,
          txHash: String(result.settlementTxHash || ""),
          resolution: (result.resolution || {
            sessionId: result.onchainSessionId || "",
            player: account || "",
            stakeAmount: "0",
            payoutAmount: "0",
            finalMultiplierBp: "0",
            outcome: 2,
            deadline: new Date().toISOString(),
          }) as ChickenBridgeSettlementResolution,
          signature: String(result.settlementSignature || ""),
          multiplier: Number(result.multiplier || 0),
          payoutAmount: 0,
          profit: 0,
          reason: reason || result.reason || "collision",
        };
      },
      autoSettlePending: async () => {
        const blocker = await getPlayBlocker();
        emitPlayBlocker(blocker);
        if (blocker.kind === "none") return false;
        const settledCount = await submitAllPendingSettlements();
        await backendFetch<{
          success: boolean;
          resolved?: boolean;
        }>("/api/game/force-end-active", {
          method: "POST",
          body: JSON.stringify({}),
        });
        await refreshPlayBlockerStatus();
        return true;
      },
      getPlayBlocker: async () => {
        const blocker = await getPlayBlocker();
        emitPlayBlocker(blocker);
        return blocker;
      },
      resolvePlayBlocker: async () => {
        const blocker = await getPlayBlocker();
        emitPlayBlocker(blocker);
        if (blocker.kind === "none") return false;
        const settledCount = await submitAllPendingSettlements();
        await backendFetch<{
          success: boolean;
          resolved?: boolean;
        }>("/api/game/force-end-active", {
          method: "POST",
          body: JSON.stringify({}),
        });
        await refreshPlayBlockerStatus();
        return true;
      },
      getPassportStatus: async () => {
        await requireBackendWalletSession();
        return backendFetch<ChickenBridgePassportStatus>("/api/passport/status");
      },
      claimPassport: async () => {
        await requireBackendWalletSession();
        if (!walletProvider) {
          throw new Error("Solana wallet provider is not ready yet.");
        }
        const wallet = walletProvider as {
          sendTransaction: (
            transaction: VersionedTransaction,
            connection: Connection,
          ) => Promise<string>;
        };

        const payload = await backendFetch<PassportIssueSignaturePayload>(
          "/api/passport/issue-signature",
          {
            method: "POST",
            body: JSON.stringify({}),
          },
        );

        if (!payload?.success || !payload?.unsignedTx) {
          throw new Error("Backend did not return passport claim transaction.");
        }

        const transaction = VersionedTransaction.deserialize(
          toBase64Bytes(payload.unsignedTx),
        );
        const connection = new Connection(SOLANA_RPC_URL, "confirmed");
        const txHash = await wallet.sendTransaction(transaction, connection);
        await connection.confirmTransaction(txHash, "confirmed");

        return {
          txHash,
          tier: Number(payload?.claim?.tier ?? payload?.eligibility?.tier ?? 0),
          expiry: Number(payload?.claim?.expiry ?? 0),
          signatureExpiry: Number(payload?.signatureExpiry ?? 0),
        };
      },
    };

    void refreshPlayBlockerStatus().catch(() => {
      emitPlayBlocker({ kind: "none" });
    });

    return () => {
      pendingUnsubscribersRef.current.forEach((dispose) => dispose());
      pendingUnsubscribersRef.current = [];
      delete window.__CHICKEN_GAME_BRIDGE__;
    };
  }, [
    account,
    backgroundMode,
    ensureBackendSession,
    hasBackendApiConfig,
    isAppChain,
    refreshBackendSession,
    walletProvider,
  ]);

  return null;
}
