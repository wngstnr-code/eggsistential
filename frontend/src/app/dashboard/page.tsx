"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useWallet } from "~/components/web3/WalletProvider";

const HOME_CONNECT_PROMPT_KEY = "chicken-home-connect-prompt";

function shortAddress(address: string) {
  if (!address) return "-";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export default function DashboardPage() {
  const [showHelp, setShowHelp] = useState(false);
  const [showProfilePopover, setShowProfilePopover] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const profileWrapRef = useRef<HTMLDivElement | null>(null);
  const {
    account,
    canDisconnect,
    isAppChain,
    isConnecting,
    walletProviderName,
    connectWallet,
    disconnectWallet,
  } = useWallet();
  const [profileCopyLabel, setProfileCopyLabel] = useState("COPY");
  const isConnected = Boolean(account);
  const showConnectedDashboardUi = isConnected && !isLoggingOut;
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

  function onConnect() {
    void connectWallet();
  }

  async function onLogout() {
    setShowProfilePopover(false);
    setIsLoggingOut(true);
    try {
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(HOME_CONNECT_PROMPT_KEY, "1");
      }
      await disconnectWallet();
    } finally {
      window.location.assign("/?connect=1");
    }
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

  return (
    <main className="flow-page dashboard-page">
      <section className="dashboard-hero">
        <div className="dashboard-bg" aria-hidden="true">
          <iframe
            className="dashboard-bg-frame"
            src="/play?bg=1"
            title="In-game background"
            tabIndex={-1}
          />
        </div>
        <div className="dashboard-overlay" aria-hidden="true" />

        <header className="home-nav home-nav-global">
          <Link className="home-brand" href="/">
            <span className="home-brand-badge">
              <img src="/favicon.png" alt="GM" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
            </span>
            <span className="home-brand-copy">
              <p className="home-brand-eyebrow">Solana Arcade Risk Game</p>
              <span className="home-brand-name">EGGSISTENTIAL</span>
            </span>
          </Link>

          <div className="home-nav-cluster">
            <div className="home-nav-actions">
              {showConnectedDashboardUi || isLoggingOut ? (
                <div className="home-profile-wrap" ref={profileWrapRef}>
                  <button
                    type="button"
                    className="flow-btn secondary home-nav-login"
                    disabled={isLoggingOut}
                    onClick={() => setShowProfilePopover((current) => !current)}
                  >
                    {isLoggingOut ? "LOGGING OUT..." : shortAddress(account)}
                  </button>

                  {showProfilePopover && !isLoggingOut && (
                    <section
                      className="flow-status home-profile-popover"
                      style={{ color: "white" }}
                    >
                      <p className="home-preview-title home-profile-heading">
                        PROFILE
                      </p>
                      <div className="home-profile-meta">
                        <div className="home-profile-row">
                          <span className="home-profile-label">Wallet</span>
                          <span className="mono home-profile-value">
                            {shortAddress(account)}
                          </span>
                        </div>
