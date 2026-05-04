"use client";

import { createAppKit } from "@reown/appkit/react";
import {
  solana,
  solanaDevnet,
  solanaTestnet,
} from "@reown/appkit/networks";
import type { AppKitNetwork } from "@reown/appkit/networks";
import { SolanaAdapter } from "@reown/appkit-adapter-solana/react";
import { SOLANA_CLUSTER } from "~/lib/web3/solana";

export const SOLANA_NAMESPACE = "solana" as const;
export const REOWN_PROJECT_ID = process.env.NEXT_PUBLIC_REOWN_PROJECT_ID || "";

export function hasReownProjectId() {
  return Boolean(REOWN_PROJECT_ID);
}

function readAppUrl() {
  if (typeof window !== "undefined") {
