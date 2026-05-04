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


// TODO: refactor this section later
console.log('debugging...');
