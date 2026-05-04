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
