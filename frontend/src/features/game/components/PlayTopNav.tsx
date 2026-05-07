"use client";



import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  BadgeCheck,
  CheckCircle2,
  Egg,
  LockKeyhole,
  Play as PlayIcon,
  ShieldCheck,
  Trophy,
  WalletCards,
} from "lucide-react";
import { useWallet } from "~/features/wallet/WalletProvider";

function shortAddress(address: string, isMobile: boolean = false) {
  if (!address) return "NO WALLET";
  if (isMobile) {
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

function formatPassportDate(timestamp: number) {
  return timestamp ? new Date(timestamp * 1000).toLocaleDateString() : "-";
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function buildPassportStatusMessage(status: ChickenBridgePassportStatus) {
  const passport = status.passport;
  if (passport.valid) {
    return `PASSPORT VALID - TIER ${passport.tier} - EXP ${formatPassportDate(passport.expiry)}`;
  }

  if (status.eligibility.eligible) {
    return `ELIGIBLE TIER ${status.eligibility.tier} - READY TO CLAIM`;
  }

  return status.progression?.progressLabel || status.eligibility.reason;
}

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
  const [passportStatus, setPassportStatus] =
    useState<ChickenBridgePassportStatus | null>(null);
  const [isPassportPanelOpen, setIsPassportPanelOpen] = useState(false);
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
  const [desktopTopBarCenter, setDesktopTopBarCenter] =
    useState<HTMLElement | null>(null);
  const navRef = useRef<HTMLElement | null>(null);
  const walletMenuRef = useRef<HTMLDivElement | null>(null);
  const alertRootRef = useRef<HTMLDivElement | null>(null);
  const menuRootRef = useRef<HTMLDivElement | null>(null);
  const statusTimeoutRef = useRef<number | null>(null);
  const lastNonZeroSfxVolumeRef = useRef(90);
  const syncRetryTimerRef = useRef<number | null>(null);
  const passportDeepLinkHandledRef = useRef(false);
  const loadPassportStatusRef = useRef<
    ((
      openPanel: boolean,
      announce?: boolean,
    ) => Promise<ChickenBridgePassportStatus | null>) | null
  >(null);
  const passportAutoLoadedWalletRef = useRef("");

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
    if (nextPercent > 0) {
      lastNonZeroSfxVolumeRef.current = nextPercent;
    }
    const normalized = nextPercent / 100;
    try {
      localStorage.setItem(SFX_STORAGE_KEY, String(normalized));
    } catch {
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

  async function loadPassportStatus(openPanel: boolean, announce = true) {
    if (passportBusy) return null;
    setPassportBusy(true);
    try {
      const bridge = getBridgeApi();
      const status = await bridge.getPassportStatus();
      const message = buildPassportStatusMessage(status);
      setPassportStatus(status);
      if (announce || openPanel) {
        setPassportStatusText(message);
      }
      if (openPanel) {
        setIsPassportPanelOpen(true);
        setIsMenuOpen(false);
      }
      if (announce) {
        dispatchStatusUpdate({
          message,
          tone: status.passport.valid
            ? "ready"
            : status.eligibility.eligible
              ? "warning"
              : "info",
          durationMs: 4200,
        });
      }
      return status;
    } catch (error) {
      const message = readActionErrorMessage(
        error,
        "Failed to check passport status.",
      );
      if (announce || openPanel) {
        setPassportStatusText(message);
      }
      if (openPanel) {
        setIsPassportPanelOpen(true);
        setIsMenuOpen(false);
      }
      if (announce) {
        dispatchStatusUpdate({
          message,
          tone: "error",
          durationMs: 4200,
        });
      }
      return null;
    } finally {
      setPassportBusy(false);
    }
  }

  async function onCheckPassportClick() {
    await loadPassportStatus(true);
    if (!passportBusy) return;

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
      const message = readActionErrorMessage(
        error,
        "Failed to check passport status.",
      );
      setPassportStatusText(message);
      dispatchStatusUpdate({
        message,
        tone: "error",
        durationMs: 4200,
      });
    } finally {
      setPassportBusy(false);
    }
  }

  useEffect(() => {
    loadPassportStatusRef.current = loadPassportStatus;
  });

  useEffect(() => {
    let frameId: number | null = null;
    let attempts = 0;

    function findDesktopTopBarCenter() {
      const topBarCenter = document.querySelector<HTMLElement>("#top-bar-center");
      if (topBarCenter) {
        setDesktopTopBarCenter(topBarCenter);
        return;
      }

      attempts += 1;
      if (attempts < 8) {
        frameId = window.requestAnimationFrame(findDesktopTopBarCenter);
      }
    }

    frameId = window.requestAnimationFrame(findDesktopTopBarCenter);

    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, []);

  useEffect(() => {
    if (
      !isConnected ||
      !isAppChain ||
      (hasBackendApiConfig && !isBackendAuthenticated)
    ) {
      passportAutoLoadedWalletRef.current = "";
      return;
    }

    const walletKey = account || "";
    if (!walletKey || passportAutoLoadedWalletRef.current === walletKey) return;

    let timerId: number | null = null;

    function loadWhenBridgeReady(attempt = 0) {
      const bridge = window.__CHICKEN_GAME_BRIDGE__;
      if (bridge && !bridge.backgroundMode) {
        passportAutoLoadedWalletRef.current = walletKey;
        void loadPassportStatusRef.current?.(false, false);
        return;
      }

      if (attempt < 8) {
        timerId = window.setTimeout(
          () => loadWhenBridgeReady(attempt + 1),
          300,
        );
      }
    }

    timerId = window.setTimeout(() => loadWhenBridgeReady(), 250);

    return () => {
      if (timerId !== null) {
        window.clearTimeout(timerId);
      }
    };
  }, [
    account,
    hasBackendApiConfig,
    isBackendAuthenticated,
    isConnected,
    isAppChain,
  ]);

  useEffect(() => {
    if (passportDeepLinkHandledRef.current) return;

    const params = new URLSearchParams(window.location.search);
    if (params.get("passport") !== "1") return;

    passportDeepLinkHandledRef.current = true;
    params.delete("passport");
    const nextSearch = params.toString();
    const nextUrl = `${window.location.pathname}${
      nextSearch ? `?${nextSearch}` : ""
    }${window.location.hash}`;
    window.history.replaceState({}, "", nextUrl);

    let timerId: number | null = null;
    let attempts = 0;

    function openPassportWhenReady() {
      attempts += 1;
      const bridge = window.__CHICKEN_GAME_BRIDGE__;
      if (bridge && !bridge.backgroundMode) {
        void loadPassportStatusRef.current?.(true);
        return;
      }

      if (attempts < 8) {
        timerId = window.setTimeout(openPassportWhenReady, 300);
        return;
      }

      void loadPassportStatusRef.current?.(true);
    }

    timerId = window.setTimeout(openPassportWhenReady, 250);

    return () => {
      if (timerId !== null) {
        window.clearTimeout(timerId);
      }
    };
  }, []);

  async function onClaimPassportClick() {
    if (passportBusy) return;
    setPassportBusy(true);
    try {
      const bridge = getBridgeApi();
      const status = passportStatus ?? (await bridge.getPassportStatus());

      if (status.passport.valid) {
        const message = buildPassportStatusMessage(status);
        setPassportStatus(status);
        setPassportStatusText(message);
        setIsPassportPanelOpen(true);
        dispatchStatusUpdate({
          message,
          tone: "ready",
          durationMs: 3600,
        });
        return;
      }

      if (!status.eligibility.eligible) {
        const message = status.eligibility.reason;
        setPassportStatus(status);
        setPassportStatusText(message);
        setIsPassportPanelOpen(true);
        dispatchStatusUpdate({
          message,
          tone: "info",
          durationMs: 4200,
        });
        return;
      }

      const result = await bridge.claimPassport();
      const expiryText = result.expiry
        ? new Date(result.expiry * 1000).toLocaleDateString()
        : "-";
      const message = `PASSPORT CLAIMED • TIER ${result.tier} • EXP ${expiryText}`;
      setPassportStatusText(message);
      setPassportPopup({
        tier: result.tier,
        expiry: result.expiry,
      });
      dispatchStatusUpdate({
        message,
        tone: "ready",
        durationMs: 4200,
      });
    } catch (error) {
      const message = readActionErrorMessage(
        error,
        "Failed to claim passport.",
      );
      setPassportStatusText(message);
      dispatchStatusUpdate({
        message,
        tone: "error",
        durationMs: 4200,
      });
    } finally {
      setPassportBusy(false);
    }
  }

  function onLeaderboardMenuClick() {
    console.log("PlayTopNav: Leaderboard button clicked");
    setIsMenuOpen(false);
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent("chicken:open-leaderboard"));
    }, 10);
  }

  async function onStatusActionClick() {
    if (isConnecting || isBackendAuthLoading || isResolvingPlayBlocker) return;

    if (playBlocker.kind !== "none") {
      const bridge = window.__CHICKEN_GAME_BRIDGE__;
      if (!bridge?.resolvePlayBlocker || !bridge?.getPlayBlocker) {
        dispatchStatusUpdate({
          message: "Game bridge is not ready yet. Please try again shortly.",
          tone: "error",
          durationMs: 4200,
        });
        return;
      }

      setIsResolvingPlayBlocker(true);
      try {
        await bridge.resolvePlayBlocker();
        const nextBlocker = await bridge.getPlayBlocker();
        setPlayBlocker(nextBlocker);
        if (nextBlocker.kind === "none") {
          dispatchStatusUpdate({
            message: "PREV BET CLEARED",
            tone: "ready",
            durationMs: 2600,
          });
        }
      } catch (error) {
        dispatchStatusUpdate({
          message: readActionErrorMessage(
            error,
            "Failed to resolve previous bet.",
          ),
          tone: "error",
          durationMs: 4200,
        });
      } finally {
        setIsResolvingPlayBlocker(false);
      }
      return;
    }

    if (!isConnected) {
      await connectWallet();
      return;
    }

    if (!isAppChain) {
      await switchToAppChain();
      return;
    }

    if (hasBackendApiConfig && !isBackendAuthenticated) {
      await authenticateBackend();
    }
  }

  useEffect(() => {
    function onPlayBlocker(event: Event) {
      const detail = (
        event as CustomEvent<ChickenBridgePlayBlocker | undefined>
      ).detail;
      setPlayBlocker(detail?.kind ? detail : { kind: "none" });
    }

    window.addEventListener(
      "chicken:play-blocker",
      onPlayBlocker as EventListener,
    );

    return () => {
      window.removeEventListener(
        "chicken:play-blocker",
        onPlayBlocker as EventListener,
      );
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function syncPlayBlocker() {
      if (
        !isConnected ||
        !isAppChain ||
        (hasBackendApiConfig && !isBackendAuthenticated)
      ) {
        if (!cancelled) {
          setPlayBlocker({ kind: "none" });
        }
        return;
      }

      const bridge = window.__CHICKEN_GAME_BRIDGE__;
      if (!bridge?.getPlayBlocker) {
        if (!cancelled) {
          setPlayBlocker({ kind: "none" });
        }
        return;
      }

      try {
        const blocker = await bridge.getPlayBlocker();
        if (!cancelled) {
          setPlayBlocker(blocker);
        }
      } catch {
        if (!cancelled) {
          setPlayBlocker({ kind: "none" });
        }
      }
    }

    void syncPlayBlocker();

    return () => {
      cancelled = true;
    };
  }, [
    account,
    hasBackendApiConfig,
    isBackendAuthenticated,
    isConnected,
    isAppChain,
  ]);

  useEffect(() => {
    if (syncRetryTimerRef.current) {
      window.clearTimeout(syncRetryTimerRef.current);
      syncRetryTimerRef.current = null;
    }

    if (!hasBackendApiConfig || !isConnected || !isAppChain) {
      return;
    }

    if (isBackendAuthenticated || isBackendAuthLoading) {
      return;
    }

    const runSync = async () => {
      await authenticateBackend();
    };

    void runSync();
    syncRetryTimerRef.current = window.setTimeout(() => {
      if (!isBackendAuthenticated && !isBackendAuthLoading) {
        void runSync();
      }
    }, 9000);

    return () => {
      if (syncRetryTimerRef.current) {
        window.clearTimeout(syncRetryTimerRef.current);
        syncRetryTimerRef.current = null;
      }
    };
  }, [
    account,
    authenticateBackend,
    hasBackendApiConfig,
    isAppChain,
    isBackendAuthenticated,
    isBackendAuthLoading,
    isConnected,
  ]);

  useEffect(() => {
    function onDocumentClick(event: MouseEvent) {
      if (event.target instanceof Node) {
        const walletRoot = walletMenuRef.current;
        if (walletRoot && !walletRoot.contains(event.target)) {
          setIsWalletMenuOpen(false);
        }
        const alertRoot = alertRootRef.current;
        if (alertRoot && !alertRoot.contains(event.target)) {
          setIsAlertsOpen(false);
        }
        const menuRoot = menuRootRef.current;
        if (menuRoot && !menuRoot.contains(event.target)) {
          setIsMenuOpen(false);
        }
      }
    }

    function onEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsWalletMenuOpen(false);
        setIsAlertsOpen(false);
        setIsMenuOpen(false);
        setIsPassportPanelOpen(false);
        setPassportPopup(null);
      }
    }

    document.addEventListener("click", onDocumentClick);
    window.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("click", onDocumentClick);
      window.removeEventListener("keydown", onEscape);
    };
  }, []);

  useEffect(() => {
    function clearTransientStatus() {
      if (statusTimeoutRef.current) {
        window.clearTimeout(statusTimeoutRef.current);
        statusTimeoutRef.current = null;
      }
      setTransientStatus(null);
    }

    function onPlayStatus(event: Event) {
      const detail = (
        event as CustomEvent<{
          clear?: boolean;
          message?: string;
          tone?: PlayStatusTone;
          sticky?: boolean;
          durationMs?: number;
        }>
      ).detail;

      if (detail?.clear) {
        clearTransientStatus();
        return;
      }

      const message = String(detail?.message || "").trim();
      if (!message) {
        clearTransientStatus();
        return;
      }

      const nextStatus: PlayStatusState = {
        message,
        tone: detail?.tone || "info",
        sticky: Boolean(detail?.sticky),
      };

      if (statusTimeoutRef.current) {
        window.clearTimeout(statusTimeoutRef.current);
        statusTimeoutRef.current = null;
      }

      setTransientStatus(nextStatus);

      if (!nextStatus.sticky) {
        const durationMs =
          Number(detail?.durationMs) > 0 ? Number(detail?.durationMs) : 3800;
        statusTimeoutRef.current = window.setTimeout(() => {
          setTransientStatus(null);
          statusTimeoutRef.current = null;
        }, durationMs);
      }
    }

    window.addEventListener(
      "chicken:play-status",
      onPlayStatus as EventListener,
    );
    return () => {
      if (statusTimeoutRef.current) {
        window.clearTimeout(statusTimeoutRef.current);
        statusTimeoutRef.current = null;
      }
      window.removeEventListener(
        "chicken:play-status",
        onPlayStatus as EventListener,
      );
    };
  }, []);

  useEffect(() => {
    if (!isConnected) {
      setIsWalletMenuOpen(false);
    }
  }, [isConnected]);

  useEffect(() => {
    if (isMenuOpen) {
      setIsAlertsOpen(false);
    }
  }, [isMenuOpen]);

  useEffect(() => {
    if (!isMobile) {
      setIsAlertsOpen(false);
    }
  }, [isMobile]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SFX_STORAGE_KEY);
      const initial = raw == null || raw === "" ? 0.9 : Number.parseFloat(raw);
      const safe = Number.isFinite(initial)
        ? Math.min(1, Math.max(0, initial))
        : 0.9;
      const initialPercent = Math.round(safe * 100);
      setSfxVolumePercent(initialPercent);
      if (initialPercent > 0) {
        lastNonZeroSfxVolumeRef.current = initialPercent;
      }
      window.dispatchEvent(
        new CustomEvent("chicken:set-sfx-volume", {
          detail: { value: safe },
        }),
      );
    } catch {
      setSfxVolumePercent(90);
    }
  }, []);

  useEffect(() => {
    const navEl = navRef.current;
    if (!navEl) return;

    const rootStyle = document.documentElement.style;
    let frameId: number | null = null;

    const updateHudOffset = () => {
      const { bottom } = navEl.getBoundingClientRect();
      rootStyle.setProperty(
        "--play-nav-hud-offset",
        `${Math.ceil(bottom + 14)}px`,
      );
      setIsMobile(window.innerWidth < 1024);
    };

    const scheduleUpdate = () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }

      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        updateHudOffset();
      });
    };

    scheduleUpdate();

    const resizeObserver = new ResizeObserver(() => {
      scheduleUpdate();
    });
    resizeObserver.observe(navEl);
    window.addEventListener("resize", scheduleUpdate);

    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
      resizeObserver.disconnect();
      window.removeEventListener("resize", scheduleUpdate);
      rootStyle.removeProperty("--play-nav-hud-offset");
    };
  }, []);

  let statusTone: PlayStatusTone = "ready";
  let statusMessage = "READY TO PLAY";
  let statusActionLabel = "";

  if (transientStatus?.message) {
    statusTone = transientStatus.tone;
    statusMessage = transientStatus.message;
  } else if (isConnecting) {
    statusTone = "busy";
    statusMessage = "CONNECTING WALLET...";
  } else if (!isConnected && error) {
    statusTone = "error";
    statusMessage = error;
    statusActionLabel = "RETRY";
  } else if (!isConnected) {
    statusTone = "warning";
    statusMessage = "CONNECT WALLET TO PLAY";
    statusActionLabel = "CONNECT";
  } else if (error) {
    statusTone = "error";
    statusMessage = error;
  } else if (!isAppChain) {
    statusTone = "warning";
    statusMessage = "SOLANA RPC CONFIG MISSING";
  } else if (hasBackendApiConfig && isBackendAuthLoading) {
    statusTone = "busy";
    statusMessage = "SYNCING DATA...";
  } else if (hasBackendApiConfig && backendAuthError) {
    statusTone = "busy";
    statusMessage = "RETRYING DATA SYNC...";
  } else if (hasBackendApiConfig && !isBackendAuthenticated) {
    statusTone = "busy";
    statusMessage = "SYNCING DATA...";
  } else if (isResolvingPlayBlocker) {
    statusTone = "busy";
    statusMessage = "ENDING PREV BET...";
  } else if (playBlocker.kind !== "none") {
    statusTone = "warning";
    statusMessage = playBlocker.message;
    statusActionLabel = playBlocker.actionLabel;
  }

  const isIdleReadyStatus =
    statusTone === "ready" &&
    statusMessage === "READY TO PLAY" &&
    !statusActionLabel &&
    !transientStatus?.message;
  const isBalancedStatus =
    statusTone === "warning" &&
    statusMessage === "SYNC DATA" &&
    statusActionLabel === "SYNC NOW";
  const isStatusActionAvailable =
    !isConnecting &&
    !isBackendAuthLoading &&
    !isResolvingPlayBlocker &&
    (Boolean(statusActionLabel) ||
      playBlocker.kind !== "none" ||
      !isConnected ||
      !isAppChain ||
      (hasBackendApiConfig && !isBackendAuthenticated));
  const hasAlertBadge =
    statusTone === "warning" ||
    statusTone === "error" ||
    statusTone === "busy" ||
    Boolean(statusActionLabel) ||
    Boolean(transientStatus?.message);
  const passportProgression = passportStatus?.progression ?? null;
  const passportStats =
    passportProgression?.stats ?? passportStatus?.eligibility.stats ?? null;
  const passportPercent = clampPercent(
    passportProgression?.percentToNextTier ?? 0,
  );
  const passportCurrentTier = passportProgression?.currentTier ?? 0;
  const passportCurrentTierLabel =
    passportProgression?.currentTierLabel ?? "Rookie";
  const passportRequirements = passportProgression?.requirements ?? [];
  const passportBenefits = passportStatus?.benefits ?? null;
  const passportConfigured = passportStatus?.passport.configured ?? true;
  const passportStatusLabel = !passportStatus
    ? passportBusy
      ? "LOADING"
      : "UNAVAILABLE"
    : passportStatus.passport.revoked
      ? "REVOKED"
      : !passportStatus.passport.configured
        ? "OFFLINE"
        : passportStatus.passport.valid
          ? "ONCHAIN VALID"
          : passportStatus.eligibility.eligible
            ? "READY TO CLAIM"
            : "IN PROGRESS";
  const passportStatusTone = !passportStatus
    ? passportBusy
      ? "loading"
      : "offline"
    : passportStatus.passport.revoked
      ? "revoked"
      : !passportStatus.passport.configured
        ? "offline"
        : passportStatus.passport.valid
          ? "valid"
          : passportStatus.eligibility.eligible
            ? "ready"
            : "progress";
  const canClaimPassport =
    Boolean(passportStatus?.eligibility.eligible) &&
    Boolean(passportStatus?.passport.configured) &&
    !passportStatus?.passport.valid &&
    !passportStatus?.passport.revoked;
  const passportCtaLabel = passportBusy
    ? "PROCESSING..."
    : !passportStatus
      ? "LOAD STATUS"
      : passportStatus.passport.valid
        ? "ALREADY CLAIMED"
        : !passportConfigured
          ? "UNAVAILABLE"
          : passportStatus.passport.revoked
            ? "REVOKED"
            : passportStatus.eligibility.eligible
              ? "CLAIM EGGPASS"
              : "LOCKED";
  const hasPassportBadgeStatus = Boolean(isConnected && passportStatus);
  const passportBadgeTier = passportStatus?.passport.valid
    ? passportStatus.passport.tier
    : passportProgression?.currentTier ?? passportStatus?.eligibility.tier ?? 0;
  const passportBadgeText = passportBusy
    ? "..."
    : hasPassportBadgeStatus
      ? `T${passportBadgeTier}`
      : "T?";
  const passportBadgeLabel = hasPassportBadgeStatus
    ? `Open passport status, tier ${passportBadgeTier}`
    : "Check passport tier";
  const passportBadgeTone = hasPassportBadgeStatus ? passportStatusTone : "offline";
  const passportBadgeButton = (className: string) => (
    <button
      type="button"
      className={`${className} ${className}-${passportBadgeTone}`}
      onClick={() => {
        void onCheckPassportClick();
      }}
      disabled={passportBusy}
      aria-label={passportBadgeLabel}
      title={passportBadgeLabel}
    >
      <BadgeCheck aria-hidden="true" />
      <span>{passportBadgeText}</span>
    </button>
  );

  return (
    <>
      {desktopTopBarCenter
        ? createPortal(
            passportBadgeButton("play-desktop-passport-badge"),
            desktopTopBarCenter,
          )
        : null}
      <div className="play-mobile-header-rail" aria-hidden="true" />
      <nav ref={navRef} className="play-nav">
        <div className="play-nav-row">
          <div ref={walletMenuRef} className="play-wallet-menu">
            <button
              type="button"
              className={`play-wallet-trigger${isConnected ? " connected" : " connect"}${isMobile ? " icon-only" : ""}`}
              onClick={() => {
                void onWalletButtonClick();
              }}
              disabled={isConnecting}
              title={
                isConnected
                  ? account
                  : "Connect Solana wallet"
              }
              aria-label={isConnected ? "Open wallet menu" : "Connect wallet"}
              aria-expanded={isConnected ? isWalletMenuOpen : false}
            >
              {isMobile ? (
                <>
                  <WalletCards aria-hidden="true" />
                  {!isConnected ? (
                    <span className="play-wallet-connect-dot" aria-hidden="true" />
                  ) : null}
                </>
              ) : isConnecting ? (
                "CONNECTING..."
              ) : isConnected ? (
                shortAddress(account, false)
              ) : (
                "CONNECT WALLET"
              )}
            </button>
            {isConnected && isWalletMenuOpen ? (
              <section className="play-wallet-popover" aria-label="Wallet menu">
                <div className="play-wallet-row">
                  <span>PROVIDER</span>
                  <strong>{walletProviderName || "SOLANA WALLET"}</strong>
                </div>
                <div className="play-wallet-row">
                  <span>PUBLIC KEY</span>
                  <strong>{shortAddress(account, false)}</strong>
                </div>
                <button
                  type="button"
                  className="play-wallet-copy"
                  onClick={() => void onWalletCopyClick()}
                >
                  {walletCopyLabel}
                </button>
              </section>
            ) : null}
          </div>
          {passportBadgeButton("play-nav-passport-badge")}
          <div className="play-nav-balance-chip" aria-live="polite">
            <span className="play-nav-balance-label">BALANCE</span>
            <strong id="balance-mobile" className="play-nav-balance-value">
              $0.00
            </strong>
          </div>
          <div className="play-nav-actions">
            {isMobile ? (
              <div ref={alertRootRef} className="play-alert-wrap">
                <button
                  type="button"
                  className={`play-alert-trigger play-alert-trigger-${statusTone}`}
                  onClick={onAlertButtonClick}
                  aria-expanded={isAlertsOpen}
                  aria-label="Open alerts"
                >
                  <span className="play-alert-icon" aria-hidden="true">
                    !
                  </span>
                  {hasAlertBadge ? (
                    <span className="play-alert-badge" aria-hidden="true" />
                  ) : null}
                </button>

                {isAlertsOpen ? (
                  <section
                    className={`play-alert-panel play-status-${statusTone}`}
                    role="dialog"
                    aria-modal="false"
                    aria-label="Alerts panel"
                  >
                    <p className="play-alert-panel-kicker">ALERTS</p>
                    <p className="play-alert-panel-message">{statusMessage}</p>
                    {isStatusActionAvailable ? (
                      <button
                        type="button"
                        className="play-alert-panel-action"
                        onClick={() => {
                          void onStatusActionClick();
                          setIsAlertsOpen(false);
                        }}
                      >
                        {statusActionLabel || "TAKE ACTION"}
                      </button>
                    ) : null}
                  </section>
                ) : null}
              </div>
            ) : null}

            <div ref={menuRootRef} className="play-menu-container">
                <button
                  type="button"
                  className={`play-menu-trigger${isMenuOpen ? " active" : ""}`}
                  onClick={onMenuButtonClick}
                  aria-expanded={isMenuOpen}
                >
                  <div className="hamburger-icon">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                  <span className="play-menu-trigger-label">MENU</span>
                </button>

                {isMenuOpen && (
                  <div
                    className="modal-bg play-menu-modal"
                    onClick={onMenuButtonClick}
                  >
                    <div
                      className="modal-box play-menu-box"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        className="close-btn"
                        onClick={onMenuButtonClick}
                        aria-label="Close"
                      >
                        X
                      </button>
                      <h2 className="play-menu-title">GAME MENU</h2>
                      <div className="play-menu-modal-list">
                        <div className="play-menu-header">
                          <span className="play-menu-wallet">
                            {isConnected
                              ? shortAddress(account, isMobile)
                              : "NOT CONNECTED"}
                          </span>
                          <button
                            type="button"
                            className="play-menu-stats-btn"
                            onClick={onStatsClick}
                          >
                            STATS
                          </button>
                        </div>
                        <div className="play-menu-modal-separator" />
                        <button
                          type="button"
                          className="play-menu-modal-item menu-item-home"
                          onClick={() => {
                            window.location.href = "/";
                          }}
                        >
                          HOME
                        </button>
                        <button
                          type="button"
                          className="play-menu-modal-item menu-item-leaderboard"
                          onClick={onLeaderboardMenuClick}
                        >
                          LEADERBOARD
                        </button>
                        <div className="play-menu-volume">
                          <div className="play-menu-volume-head">
                            <span>SFX VOLUME</span>
                            <strong>{sfxVolumePercent}%</strong>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={100}
                            step={1}
                            value={sfxVolumePercent}
                            onChange={(event) => {
                              updateSfxVolume(Number(event.target.value));
                            }}
                            aria-label="SFX volume"
                          />
                          <button
                            type="button"
                            className="play-menu-volume-mute"
                            onClick={() => {
                              if (sfxVolumePercent <= 0) {
                                updateSfxVolume(lastNonZeroSfxVolumeRef.current || 90);
                              } else {
                                updateSfxVolume(0);
                              }
                            }}
                          >
                            {sfxVolumePercent <= 0 ? "UNMUTE" : "MUTE"}
                          </button>
                        </div>
                        <div className="play-menu-modal-separator" />
                        {canDisconnect ? (
                          <button
                            type="button"
                            className="play-menu-modal-item logout"
                            onClick={onLogoutClick}
                          >
                            LOG OUT
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                )}
              </div>
          </div>
        </div>
        <button
          type="button"
          className="play-nav-deposit"
          onClick={onManageMoneyClick}
          data-menu-open={isMenuOpen}
        >
          MANAGE MONEY
        </button>
        {isMobile ? (
          <div className={`play-bottom-navbar-v2${isMenuOpen ? " hidden" : ""}`}>
            <button
              type="button"
              className="play-bottom-nav-tab"
              onClick={() => {
                dispatchStatusUpdate({
                  message: "CHARACTER MENU COMING SOON",
                  tone: "info",
                  durationMs: 2600,
                });
              }}
              aria-label="Open character menu"
            >
              <Egg aria-hidden="true" />
              <span>CHAR</span>
            </button>
            <button
              type="button"
              className="play-bottom-nav-tab"
              onClick={onManageMoneyClick}
              aria-label="Manage money"
            >
              <WalletCards aria-hidden="true" />
              <span>MONEY</span>
            </button>
            <div className="play-bottom-nav-center">
              <button
                type="button"
                className="play-bottom-nav-play-circle"
                onClick={() => {
                  const betBtn = document.getElementById("bet-btn");
                  if (betBtn) betBtn.click();
                }}
                aria-label="PLAY"
              >
                <PlayIcon aria-hidden="true" fill="currentColor" />
              </button>
              <span>PLAY</span>
            </div>
            <button
              type="button"
              className="play-bottom-nav-tab"
              onClick={onLeaderboardMenuClick}
              aria-label="Open leaderboard"
            >
              <Trophy aria-hidden="true" />
              <span>LEADERS</span>
            </button>
            <button
              type="button"
              className="play-bottom-nav-tab play-bottom-nav-tab-passport"
              onClick={() => {
                void onCheckPassportClick();
              }}
              disabled={passportBusy}
              aria-label="Open passport status"
            >
              <BadgeCheck aria-hidden="true" />
              <span>PASSPORT</span>
            </button>
          </div>
        ) : null}
        <div
          className={`play-status play-status-${statusTone}${isIdleReadyStatus ? " play-status-idle" : ""}${isBalancedStatus ? " play-status-balanced" : ""}`}
          aria-live="polite"
        >
          <span className="play-status-text">{statusMessage}</span>
          {statusActionLabel ? (
            <button
              type="button"
              className="play-status-action"
              onClick={() => {
                void onStatusActionClick();
              }}
              disabled={
                isConnecting || isBackendAuthLoading || isResolvingPlayBlocker
              }
            >
              {statusActionLabel}
            </button>
          ) : null}
        </div>
      </nav>
      {isPassportPanelOpen ? (
        <div
          className="modal-bg play-passport-modal play-passport-status-modal"
          onClick={() => {
            if (!passportBusy) setIsPassportPanelOpen(false);
          }}
        >
          <div
            className="modal-box play-passport-box play-passport-status-box"
            role="dialog"
            aria-modal="true"
            aria-labelledby="passport-status-title"
            onClick={(event) => {
              event.stopPropagation();
            }}
          >
            <button
              className="close-btn"
              type="button"
              aria-label="Close passport status"
              onClick={() => {
                if (!passportBusy) setIsPassportPanelOpen(false);
              }}
              disabled={passportBusy}
            >
              X
            </button>
            <div className="play-passport-status-headline">
              <div>
                <p className="play-passport-kicker">TRUST PASSPORT</p>
                <h3 id="passport-status-title" className="play-passport-title">
                  EGGPASS
                </h3>
              </div>
              <span
                className={`play-passport-state-pill play-passport-state-${passportStatusTone}`}
              >
                {passportStatusLabel}
              </span>
            </div>

            <div className="play-passport-status-layout">
              <div className="play-passport-card play-passport-live-card">
                <div className="play-passport-base-badge" aria-label="Solana">
                  <span className="play-passport-base-text">SOLANA</span>
                  <span
                    className="play-passport-base-logo"
                    aria-hidden="true"
                  />
                </div>
                <p className="play-passport-name">
                  {shortAddress(passportStatus?.walletAddress || account || "")}
                </p>
                <p className="play-passport-tier">
                  TIER {passportCurrentTier}
                </p>
                <p className="play-passport-expiry">
                  {passportStatus?.passport.valid
                    ? `VALID UNTIL ${formatPassportDate(passportStatus.passport.expiry)}`
                    : passportCurrentTierLabel}
                </p>
              </div>

              <div className="play-passport-summary">
                <div className="play-passport-summary-row">
                  <span>CURRENT TIER</span>
                  <strong>{passportCurrentTierLabel}</strong>
                </div>
                <div className="play-passport-summary-row">
                  <span>NEXT TIER</span>
                  <strong>
                    {passportProgression?.nextTierLabel || "MAX TIER"}
                  </strong>
                </div>
                <div className="play-passport-summary-row">
                  <span>ONCHAIN</span>
                  <strong>
                    {passportStatus?.passport.valid ? "VALID" : "NOT ACTIVE"}
                  </strong>
                </div>
              </div>
            </div>

            {passportBenefits ? (
              <div className="play-passport-benefits">
                <div>
                  <span>UNLOCKED ACCESS</span>
                  <div className="play-passport-benefit-list">
                    {passportBenefits.current.length > 0 ? (
                      passportBenefits.current.map((benefit) => (
                        <strong key={benefit}>{benefit}</strong>
                      ))
                    ) : (
                      <strong>Basic Profile</strong>
                    )}
                  </div>
                </div>
                <div>
                  <span>NEXT UNLOCK</span>
                  <div className="play-passport-benefit-list">
                    {passportBenefits.next.length > 0 ? (
                      passportBenefits.next.map((benefit) => (
                        <strong key={benefit}>{benefit}</strong>
                      ))
                    ) : (
                      <strong>Max Tier</strong>
                    )}
                  </div>
                </div>
              </div>
            ) : null}

            <div className="play-passport-progress-block">
              <div className="play-passport-progress-head">
                <span>{passportProgression?.nextTierLabel || "TOP TIER"}</span>
                <strong>{passportPercent}%</strong>
              </div>
              <div
                className="play-passport-progress-track"
                role="progressbar"
                aria-label="Passport tier progress"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={passportPercent}
              >
                <span style={{ width: `${passportPercent}%` }} />
              </div>
              <p>{passportStatusText || "Load EggPass status to view progress."}</p>
            </div>

            <div className="play-passport-requirements">
              {passportRequirements.length > 0 ? (
                passportRequirements.map((requirement) => (
                  <div
                    key={requirement.key}
                    className={`play-passport-requirement${requirement.met ? " met" : ""}`}
                  >
                    <span className="play-passport-requirement-icon">
                      {requirement.met ? (
                        <CheckCircle2 aria-hidden="true" />
                      ) : (
                        <LockKeyhole aria-hidden="true" />
                      )}
                    </span>
                    <span className="play-passport-requirement-label">
                      {requirement.label}
                    </span>
                    <strong>
                      {requirement.current}/{requirement.target}
                    </strong>
                  </div>
                ))
              ) : (
                <div className="play-passport-requirement met">
                  <span className="play-passport-requirement-icon">
                    <ShieldCheck aria-hidden="true" />
                  </span>
                  <span className="play-passport-requirement-label">
                    Top tier progress complete
                  </span>
                  <strong>DONE</strong>
                </div>
              )}
            </div>

            {passportStats ? (
              <div className="play-passport-stats-grid">
                <div>
                  <span>CASHOUTS</span>
                  <strong>{passportStats.successfulCashouts}</strong>
                </div>
                <div>
                  <span>BEST HOPS</span>
                  <strong>{passportStats.bestHops}</strong>
                </div>
                <div>
                  <span>CONSISTENCY</span>
                  <strong>{passportStats.consistencyScore}%</strong>
                </div>
              </div>
            ) : null}

            <div className="play-passport-actions">
              <button
                type="button"
                className="play-passport-secondary"
                onClick={() => {
                  void loadPassportStatus(false);
                }}
                disabled={passportBusy}
              >
                REFRESH
              </button>
              <button
                type="button"
                className="play-passport-cta"
                onClick={() => {
                  if (!passportStatus) {
                    void loadPassportStatus(false);
                    return;
                  }
                  void onClaimPassportClick();
                }}
                disabled={passportBusy || Boolean(passportStatus && !canClaimPassport)}
              >
                {passportCtaLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {passportPopup ? (
        <div
          className="modal-bg play-passport-modal"
          onClick={() => {
            setPassportPopup(null);
          }}
        >
          <div
            className="modal-box play-passport-box"
            onClick={(event) => {
              event.stopPropagation();
            }}
          >
            <button
              className="close-btn"
              type="button"
              aria-label="Close passport popup"
              onClick={() => {
                setPassportPopup(null);
              }}
            >
              X
            </button>
            <p className="play-passport-kicker">CHICKEN TRUST PASSPORT</p>
            <h3 className="play-passport-title">PASSPORT CLAIMED</h3>
            <div className="play-passport-card">
              <div className="play-passport-base-badge" aria-label="Solana">
                <span className="play-passport-base-text">SOLANA</span>
                <span className="play-passport-base-logo" aria-hidden="true" />
              </div>
              <p className="play-passport-name">
                {shortAddress(account || "")}
              </p>
              <p className="play-passport-tier">TIER {passportPopup.tier}</p>
              <p className="play-passport-expiry">
                EXP:{" "}
                {new Date(passportPopup.expiry * 1000).toLocaleDateString()}
              </p>
            </div>
            <button
              type="button"
              className="play-passport-cta"
              onClick={() => {
                setPassportPopup(null);
              }}
            >
              NICE!
            </button>
          </div>
        </div>
      ) : null}
      <div
        id="leaderboard-modal"
        className="modal-bg"
        style={{ display: "none" }}
        aria-hidden="true"
      >
        <div className="modal-box leaderboard-modal-box">
          <button
            className="close-btn"
            id="leaderboard-close-btn"
            type="button"
          >
            X
          </button>
          <div className="leaderboard-panel-head">
            <h3>TOP PLAYERS</h3>
            <div
              className="leaderboard-filter-tabs"
              role="tablist"
              aria-label="Leaderboard filter"
            >
              <button
                id="leaderboard-filter-all"
                className="active"
                type="button"
                role="tab"
                aria-selected="true"
              >
                ALL
              </button>
              <button
                id="leaderboard-filter-verified"
                type="button"
                role="tab"
                aria-selected="false"
              >
                VERIFIED
              </button>
            </div>
          </div>
          <p id="leaderboard-status" className="leaderboard-status">
            Top 10 players by best hops.
          </p>
          <div className="leaderboard-self-card">
            <span>YOUR RANK</span>
            <strong id="leaderboard-your-rank">-</strong>
          </div>
          <ol id="leaderboard-list" className="leaderboard-list" />
          <button id="leaderboard-refresh" type="button">
            REFRESH
          </button>
        </div>
      </div>

      <div
        id="stats-modal"
        className="modal-bg"
        style={{ display: "none" }}
        aria-hidden="true"
      >
        <div className="modal-box stats-modal-box">
          <button className="close-btn" id="stats-close-btn" type="button">
            X
          </button>
          <div className="leaderboard-panel-head">
            <h3>PLAYER STATS</h3>
          </div>
          <p id="stats-status" className="leaderboard-status">
            Track your runs and recent onchain activity.
          </p>
          <div className="stats-summary-grid">
            <div className="stats-summary-card">
              <span>GAMES</span>
              <strong id="stats-total-games">0</strong>
            </div>
            <div className="stats-summary-card">
              <span>WINS</span>
              <strong id="stats-total-wins">0</strong>
            </div>
            <div className="stats-summary-card">
              <span>LOSSES</span>
              <strong id="stats-total-losses">0</strong>
            </div>
            <div className="stats-summary-card">
              <span>WIN RATE</span>
              <strong id="stats-win-rate">0%</strong>
            </div>
            <div className="stats-summary-card">
              <span>NET PNL</span>
              <strong id="stats-total-profit">$0.00</strong>
            </div>
            <div className="stats-summary-card">
              <span>HISTORY</span>
              <strong id="stats-last-five-runs">-</strong>
            </div>
          </div>
          <p id="stats-joined" className="stats-joined">
            Joined: -
          </p>
          <div
            className="stats-tabs"
            role="tablist"
            aria-label="Player history"
          >
            <button
              id="stats-tab-runs"
              className="active"
              type="button"
              data-stats-tab="runs"
              role="tab"
              aria-selected="true"
            >
              RUNS
            </button>
            <button
              id="stats-tab-txs"
              type="button"
              data-stats-tab="txs"
              role="tab"
              aria-selected="false"
            >
              TXS
            </button>
          </div>
          <div id="stats-list" className="stats-list" />
          <button id="stats-refresh" type="button">
            REFRESH
          </button>
        </div>
      </div>
    </>
  );
}
