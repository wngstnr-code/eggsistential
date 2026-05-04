"use client";

export type SolanaCluster = "devnet" | "testnet" | "mainnet-beta" | "custom";

const DEFAULT_CLUSTER: SolanaCluster = "testnet";
const DEFAULT_RPC_URL = "https://api.testnet.solana.com";

export const SOLANA_CLUSTER = (
  process.env.NEXT_PUBLIC_SOLANA_CLUSTER || DEFAULT_CLUSTER
) as SolanaCluster;

// TODO: refactor this section later
console.log('debugging...');
