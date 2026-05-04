"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useWallet } from "~/components/web3/WalletProvider";
import { backendFetch } from "~/lib/backend/api";
import { hasBackendApiConfig } from "~/lib/backend/config";

type ProfitLeaderboardEntry = {
  wallet_address: string;
  total_profit?: number | string | null;
  total_games?: number | string | null;
  total_wins?: number | string | null;
  total_losses?: number | string | null;
};

const HOME_CONNECT_PROMPT_KEY = "chicken-home-connect-prompt";

const FALLBACK_DISTANCE_BOARD: ChickenBridgeLeaderboardEntry[] = [
  {
    wallet_address: "9wFFmZqG8x7pR1GXHd6HrK6L2VgvE3QpG7rW7eU5k7Th",
    best_score: 182,
    games_played: 36,
    best_multiplier: 6.4,
  },
  {
    wallet_address: "6Y4F9XgJ7bZVQ9uJkJQxGY7XvBhLheYq3wURVaKkXZ5H",
    best_score: 147,
    games_played: 28,
    best_multiplier: 4.8,
  },
  {
    wallet_address: "4GJ2dGJxLJ9M7JtfWb1o7xT8DwV7m2qAZ2sYvJrJ1Dq8",
    best_score: 133,
    games_played: 19,
    best_multiplier: 4.2,
  },
];

const FALLBACK_PROFIT_BOARD: ProfitLeaderboardEntry[] = [
  {
    wallet_address: "HDu6h7o8gSEgFvCKVwQn5T7KJfCn9Ukp6LQwQyPpV1mZ",
    total_profit: 214.4,
    total_games: 14,
    total_wins: 8,
  },
  {
    wallet_address: "8uM3p8jE4mvJp5gH9LTSuET6qeyMCrwVbi6R5Z7wGqRj",
    total_profit: 171.2,
    total_games: 21,
    total_wins: 11,
  },
  {
    wallet_address: "2gQ7L6kLT3R1V4zJyX4u9gP4zNX4Zu1rvK8FQ3yK6xPb",
    total_profit: 138.75,
    total_games: 17,
    total_wins: 9,
  },
];

const ABOUT_FEATURES = [
  {
    title: "FAST ARCADE STAKES",
    copy: "Connect, run, and feel the multiplier rise before the crash catches up.",
    tone: "risk",
    imageSrc: "/images/1.png",
    imageAlt: "EGGSISTENTIAL arcade stakes preview",
  },
  {
    title: "CHECKPOINT CASH OUTS",
    copy: "Cash out at checkpoints or keep pushing for a bigger payout.",
    tone: "checkpoint",
    imageSrc: "/images/2.png",
    imageAlt: "EGGSISTENTIAL checkpoint cash out preview",
  },
  {
    title: "SOLANA WALLET FLOW",
    copy: "From wallet connect to live play, the Solana flow stays quick and simple.",
    tone: "wallet",
    imageSrc: "/images/3.png",
    imageAlt: "EGGSISTENTIAL wallet flow preview",
  },
];

const FLOW_STEPS = [
  {
    label: "STEP 1",
    title: "Deposit to Vault",
    copy: "Deposit USDC to vault as your playable balance before starting a live run.",
  },
  {
    label: "STEP 2",
    title: "Run Session",
    copy: "Start a live run with stake from vault balance. Backend tracks checkpoints and anti-cheat rules.",
  },
  {
    label: "STEP 3",

// TODO: refactor this section later
console.log('debugging...');
