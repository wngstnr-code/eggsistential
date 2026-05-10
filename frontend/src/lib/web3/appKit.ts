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
    return window.location.origin;
  }

  return "https://eggsistential.vercel.app";
}

function readAppKitNetwork(): AppKitNetwork {
  if (SOLANA_CLUSTER === "mainnet-beta") return solana;
  if (SOLANA_CLUSTER === "devnet") return solanaDevnet;
  return solanaTestnet;
}

export const SOLANA_APPKIT_NETWORK = readAppKitNetwork();
export const SOLANA_APPKIT_NETWORKS: [AppKitNetwork, ...AppKitNetwork[]] = [
  SOLANA_APPKIT_NETWORK,
];

export const appKit = hasReownProjectId()
  ? createAppKit({
      adapters: [new SolanaAdapter()],
      networks: SOLANA_APPKIT_NETWORKS,
      defaultNetwork: SOLANA_APPKIT_NETWORK,
      projectId: REOWN_PROJECT_ID,
      metadata: {
        name: "EGGSISTENTIAL",
        description:
          "A competitive onchain chicken-crossing game on Solana.",
        url: readAppUrl(),
        icons: [`${readAppUrl()}/favicon.png`],
      },
      themeMode: "dark",
      features: {
        analytics: false,
        email: true,
        socials: ["google", "apple", "x", "discord"],
        swaps: false,
        onramp: false,
        history: false,
      },
    })
  : null;
