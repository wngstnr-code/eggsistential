"use client";

export type SolanaCluster = "devnet" | "testnet" | "mainnet-beta" | "custom";

const DEFAULT_CLUSTER: SolanaCluster = "testnet";
const DEFAULT_RPC_URL = "https://api.testnet.solana.com";

export const SOLANA_CLUSTER = (
  process.env.NEXT_PUBLIC_SOLANA_CLUSTER || DEFAULT_CLUSTER
) as SolanaCluster;
export const SOLANA_RPC_URL =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL || DEFAULT_RPC_URL;
export const SOLANA_EXPLORER_CLUSTER =
  SOLANA_CLUSTER === "mainnet-beta" ? "" : `?cluster=${SOLANA_CLUSTER}`;

export function hasSolanaConfig() {
  return Boolean(SOLANA_CLUSTER && SOLANA_RPC_URL);
}

export function explorerTxUrl(signature: string) {
  if (!signature) return "";
  return `https://explorer.solana.com/tx/${signature}${SOLANA_EXPLORER_CLUSTER}`;
}

