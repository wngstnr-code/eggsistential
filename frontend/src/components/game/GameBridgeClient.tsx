"use client";

import { useEffect } from "react";
import { useWallet } from "~/components/web3/WalletProvider";
import { backendFetch } from "~/lib/backend/api";

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
    return await backendFetch<{
      hasPending: boolean;
      pendingSettlements: PendingSettlementSession[];
    }>("/api/game/pending-settlement");
  } catch {
    return {
      hasPending: false,
      pendingSettlements: [],
    };
  }
}

export function GameBridgeClient({
  backgroundMode = false,
}: GameBridgeClientProps) {
  const {
    account,
    isAppChain,
    hasBackendApiConfig,
    ensureBackendSession,
    refreshBackendSession,
  } = useWallet();

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
              runsEvaluated: 0,
              bestHops: 0,
              averageHops: 0,
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

    window.__CHICKEN_GAME_BRIDGE__ = {
      backgroundMode: false,
      loadAvailableBalance: async () => {
        if (!account || !hasBackendApiConfig) return 0;
        await refreshBackendSession();
        return 0;
      },
      loadDepositBalances: async () => {
        if (account && hasBackendApiConfig) {
          await refreshBackendSession();
        }

        return {
          walletBalance: 0,
          availableBalance: 0,
          lockedBalance: 0,
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
        normalizeStakeInput(stakeInput);
        throw pendingProgramError("Start bet");
      },
      sendMove: () => {},
      cashOut: async () => {
        await requireBackendWalletSession();
        throw pendingProgramError("Cash out");
      },
      crash: async () => {
        await requireBackendWalletSession();
        throw pendingProgramError("Crash settlement");
      },
      autoSettlePending: async () => {
        const blocker = await getPlayBlocker();
        emitPlayBlocker(blocker);
        if (blocker.kind === "none") return false;
        throw pendingProgramError("Resolve previous bet");
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
        throw pendingProgramError("Resolve previous bet");
      },
      getPassportStatus: async () => {
        await requireBackendWalletSession();
        return backendFetch<ChickenBridgePassportStatus>("/api/passport/status");
      },
      claimPassport: async () => {
        await requireBackendWalletSession();
        throw pendingProgramError("Claim passport");
      },
    };

    void refreshPlayBlockerStatus().catch(() => {
      emitPlayBlocker({ kind: "none" });
    });

    return () => {
      delete window.__CHICKEN_GAME_BRIDGE__;
    };
  }, [
    account,
    backgroundMode,
    ensureBackendSession,
    hasBackendApiConfig,
    isAppChain,
    refreshBackendSession,
  ]);

  return null;
}
