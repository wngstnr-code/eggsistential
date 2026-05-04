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
