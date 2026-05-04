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
    title: "Signed Settlement",
    copy: "Result is prepared for Solana settlement. Win goes back to vault balance once the program flow is wired.",
  },
];

const PASSPORT_FEATURES = [
  {
    label: "HUMAN SCORE",
    title: "Behavior-based trust signal",
    copy: "Passport points are built from gameplay patterns and anti-bot signals, not from social hype.",
  },
  {
    label: "ONCHAIN PROOF",
    title: "Verifiable by any app",
    copy: "Partner apps can verify wallet trust status through Solana program data before granting access or rewards.",
  },
  {
    label: "USE CASE",
    title: "Airdrop and allowlist filter",
    copy: "Projects can reduce sybil noise by checking passport eligibility directly from contract + API.",
  },
];

const INTEGRATION_STEPS = [
  "Read passport status from backend API for quick integration in web app flows.",
  "Verify wallet passport eligibility from Solana program data for trustless checks.",
  "Combine both: fast UX from API plus Solana verification before sensitive actions.",
];

function shortAddress(address: string) {
  if (!address) return "-";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatMoney(value: unknown) {
  const numeric = toNumber(value);
  return `$${numeric.toFixed(4)}`;
}

function readBestScore(entry: ChickenBridgeLeaderboardEntry) {
  return toNumber(entry.best_score ?? entry.max_row_reached);
}

function readBestMultiplier(entry: ChickenBridgeLeaderboardEntry) {
  return toNumber(entry.best_multiplier);
}

export default function Home() {
  const {
    account,
    canDisconnect,
    isAppChain,
    isConnecting,
    error,
    walletProviderName,
    connectWallet,
    clearWalletError,
    disconnectWallet,
  } = useWallet();
  const [showProfilePopover, setShowProfilePopover] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showHeroConnectPrompt, setShowHeroConnectPrompt] = useState(false);
  const [profileCopyLabel, setProfileCopyLabel] = useState("COPY");
  const [distanceBoard, setDistanceBoard] = useState<
    ChickenBridgeLeaderboardEntry[]
  >(FALLBACK_DISTANCE_BOARD);
  const [profitBoard, setProfitBoard] = useState<ProfitLeaderboardEntry[]>(
    FALLBACK_PROFIT_BOARD,
  );
  const [isSocialLoading, setIsSocialLoading] = useState(false);
  const profileWrapRef = useRef<HTMLDivElement | null>(null);

  const isConnected = Boolean(account);
  const walletUsdcDisplay = "-";

  useEffect(() => {
    if (!showProfilePopover) return;

    function onMouseDown(event: MouseEvent) {
      const target = event.target as Node | null;
      if (
        profileWrapRef.current &&
        target &&
        !profileWrapRef.current.contains(target)
      ) {
        setShowProfilePopover(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setShowProfilePopover(false);
      }
    }

    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [showProfilePopover]);

  useEffect(() => {
    if (!hasBackendApiConfig()) {
      return;
    }

    let cancelled = false;
    setIsSocialLoading(true);

    void Promise.allSettled([
      backendFetch<{ leaderboard?: ChickenBridgeLeaderboardEntry[] }>(
        "/api/leaderboard",
      ),
      backendFetch<{ leaderboard?: ProfitLeaderboardEntry[] }>(
        "/api/leaderboard/profit",
      ),
    ])
      .then(([distanceResult, profitResult]) => {
        if (cancelled) return;

        if (
          distanceResult.status === "fulfilled" &&
          Array.isArray(distanceResult.value?.leaderboard) &&
          distanceResult.value.leaderboard.length > 0
        ) {
          setDistanceBoard(distanceResult.value.leaderboard.slice(0, 3));
        }

        if (
          profitResult.status === "fulfilled" &&
          Array.isArray(profitResult.value?.leaderboard) &&
          profitResult.value.leaderboard.length > 0
        ) {
          setProfitBoard(profitResult.value.leaderboard.slice(0, 3));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsSocialLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (isConnected) {
      setShowHeroConnectPrompt(false);
    }
  }, [isConnected]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const shouldOpenFromQuery = params.get("connect") === "1";
    const shouldOpenFromLogout =
      window.sessionStorage.getItem(HOME_CONNECT_PROMPT_KEY) === "1";

    if ((!shouldOpenFromQuery && !shouldOpenFromLogout) || isConnected) {
      return;
    }

    setShowHeroConnectPrompt(true);
    setShowProfilePopover(false);
    clearWalletError();
    window.sessionStorage.removeItem(HOME_CONNECT_PROMPT_KEY);
    window.scrollTo({ top: 0, behavior: "auto" });

    params.delete("connect");
    const nextSearch = params.toString();
    const nextUrl = `${window.location.pathname}${
      nextSearch ? `?${nextSearch}` : ""
    }${window.location.hash}`;
    window.history.replaceState({}, "", nextUrl);
  }, [clearWalletError, isConnected]);

  function onLogout() {
    disconnectWallet();
    setShowProfilePopover(false);
  }

  async function onCopyWallet() {
    if (!account || typeof navigator === "undefined") return;

    try {
      await navigator.clipboard.writeText(account);
      setProfileCopyLabel("COPIED");
      window.setTimeout(() => setProfileCopyLabel("COPY"), 1400);
    } catch {
      setProfileCopyLabel("FAILED");
      window.setTimeout(() => setProfileCopyLabel("COPY"), 1400);
    }
  }

  function openHeroConnectPrompt() {
    setShowHeroConnectPrompt(true);
    setShowProfilePopover(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function onHeroPlayNow() {
    if (isConnected) {
      window.location.href = "/play";
      return;
    }
    openHeroConnectPrompt();
  }

  function onHeroBack() {
    setShowHeroConnectPrompt(false);
    clearWalletError();
  }

  const trackedRuns = profitBoard.reduce(
    (sum, entry) => sum + toNumber(entry.total_games),
    0,
  );
  const playersOnline = Math.max(
    18,
    distanceBoard.length * 23 + profitBoard.length * 19,
  );
  const trackedVolume = profitBoard.reduce(
    (sum, entry) => sum + Math.max(toNumber(entry.total_profit) * 5.5, 0),
    0,
  );

  const socialStats = [
    {
      label: "PLAYERS LIVE",
      value: playersOnline.toString(),
      note: "Wallets active now",
      icon: (
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
          <circle cx="9" cy="7" r="4"></circle>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
        </svg>
      ),
    },
    {
      label: "RUNS DONE",
      value: trackedRuns.toString(),
      note: "Completed sessions",
      icon: (
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
        </svg>
      ),
    },
    {
      label: "TRACKED VOLUME",
      value: formatMoney(trackedVolume),
      note: "Estimated from recent boards",
      icon: (
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 3h12l4 6-10 12L2 9z"></path>
          <path d="M11 3 8 9l3 12 3-12-3-6z"></path>
          <path d="M2 9h20"></path>
        </svg>
      ),
    },
  ];
