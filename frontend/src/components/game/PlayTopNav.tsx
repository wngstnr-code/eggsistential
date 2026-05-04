"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useRef, useState } from "react";
import {
  BadgeCheck,
  House,
  Play as PlayIcon,
  Trophy,
  WalletCards,
} from "lucide-react";
import { useWallet } from "~/components/web3/WalletProvider";

function shortAddress(address: string, isMobile: boolean = false) {
  if (!address) return "NO WALLET";
  if (isMobile) {
    // Shorter format for mobile to prevent overflow (e.g., 0x12...34)
    return `${address.slice(0, 4)}.${address.slice(-2)}`;
  }
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function readActionErrorMessage(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "message" in error) {
    const message = String(
      (error as { message?: string }).message || "",
    ).trim();
    if (message) return message;
  }

  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }

  return fallback;
}

type PlayStatusTone = "ready" | "info" | "warning" | "error" | "busy";

type PlayStatusState = {
  message: string;
  tone: PlayStatusTone;
  sticky?: boolean;
};

type PassportPopupState = {
  tier: number;
  expiry: number;
};

const SFX_STORAGE_KEY = "chickenSfxVolume";

export function PlayTopNav() {
  const {
    account,
    canDisconnect,
    isConnecting,
    isAppChain,
    walletProviderName,
    connectWallet,
    disconnectWallet,
    switchToAppChain,
    error,
    isBackendAuthenticated,
    isBackendAuthLoading,
    backendAuthError,
    authenticateBackend,
    hasBackendApiConfig,
  } = useWallet();
  const [isWalletMenuOpen, setIsWalletMenuOpen] = useState(false);
  const [walletCopyLabel, setWalletCopyLabel] = useState("COPY");
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isAlertsOpen, setIsAlertsOpen] = useState(false);
  const [sfxVolumePercent, setSfxVolumePercent] = useState(90);
  const [passportStatusText, setPassportStatusText] = useState("");
  const [passportBusy, setPassportBusy] = useState(false);
  const [passportPopup, setPassportPopup] = useState<PassportPopupState | null>(
    null,
  );
  const [transientStatus, setTransientStatus] =
    useState<PlayStatusState | null>(null);
  const [playBlocker, setPlayBlocker] = useState<ChickenBridgePlayBlocker>({
    kind: "none",
  });
  const [isResolvingPlayBlocker, setIsResolvingPlayBlocker] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const navRef = useRef<HTMLElement | null>(null);
  const walletMenuRef = useRef<HTMLDivElement | null>(null);
  const alertRootRef = useRef<HTMLDivElement | null>(null);
  const menuRootRef = useRef<HTMLDivElement | null>(null);
  const statusTimeoutRef = useRef<number | null>(null);

  const isConnected = Boolean(account);

  function onManageMoneyClick() {
    window.location.href = "/managemoney";
  }

  function dispatchStatusUpdate(detail: {
    message?: string;
    tone?: PlayStatusTone;
    sticky?: boolean;
    clear?: boolean;
    durationMs?: number;
  }) {
    window.dispatchEvent(
      new CustomEvent("chicken:play-status", {
        detail,
      }),
    );
  }

  async function onWalletButtonClick() {
    if (!isConnected) {
      await connectWallet();
      return;
    }

    setIsWalletMenuOpen((prev) => !prev);
  }

  function onLogoutClick() {
    disconnectWallet();
    setIsWalletMenuOpen(false);
    setIsMenuOpen(false);
  }

  async function onWalletCopyClick() {
    if (!account || typeof navigator === "undefined") return;

    try {
      await navigator.clipboard.writeText(account);
      setWalletCopyLabel("COPIED");
      window.setTimeout(() => setWalletCopyLabel("COPY"), 1400);
    } catch {
      setWalletCopyLabel("FAILED");
      window.setTimeout(() => setWalletCopyLabel("COPY"), 1400);
    }
  }

  function onMenuButtonClick() {
    setIsMenuOpen((prev) => !prev);
  }

  function onAlertButtonClick() {
    setIsAlertsOpen((prev) => !prev);
  }

  function updateSfxVolume(percent: number) {
    const nextPercent = Math.min(100, Math.max(0, Math.round(percent)));
    setSfxVolumePercent(nextPercent);
    const normalized = nextPercent / 100;
    try {
      localStorage.setItem(SFX_STORAGE_KEY, String(normalized));
    } catch {
      // ignore storage errors
    }
    window.dispatchEvent(
      new CustomEvent("chicken:set-sfx-volume", {
        detail: { value: normalized },
      }),
    );
  }

  function onStatsClick() {
    console.log("PlayTopNav: Stats button clicked");
    setIsMenuOpen(false);
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent("chicken:open-stats"));
    }, 10);
  }

  function getBridgeApi() {
    const bridge = window.__CHICKEN_GAME_BRIDGE__;
    if (!bridge || bridge.backgroundMode) {
      throw new Error("Game bridge is not ready yet.");
    }
    return bridge;
  }

  async function onCheckPassportClick() {
    if (passportBusy) return;
    setPassportBusy(true);
    try {
      const bridge = getBridgeApi();
      const status = await bridge.getPassportStatus();
      const passport = status.passport;
      if (passport?.valid) {
        const expiryText = passport.expiry
          ? new Date(passport.expiry * 1000).toLocaleDateString()
          : "-";
        const message = `PASSPORT VALID • TIER ${passport.tier} • EXP ${expiryText}`;
        setPassportStatusText(message);
        dispatchStatusUpdate({
          message,
          tone: "ready",
          durationMs: 3600,
        });
        return;
      }

      const eligibility = status.eligibility;
      const message = eligibility?.eligible
        ? `ELIGIBLE TIER ${eligibility.tier} • READY TO CLAIM`
        : eligibility?.reason || "Not eligible for passport yet.";
      setPassportStatusText(message);
      dispatchStatusUpdate({
        message,
        tone: eligibility?.eligible ? "warning" : "info",
        durationMs: 4200,
      });
    } catch (error) {
