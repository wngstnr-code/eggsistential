"use client";

import type { ChangeEvent } from "react";
import { useEffect, useMemo } from "react";
import type { DepositFlowViewModel } from "./types";
import { useDepositFlow } from "./useDepositFlow";

type QuickAmountPreset = {
  label: string;
  value: string;
};

type ActivityItem = {
  label: string;
  hash: string;
  url: string;
};

function readQuickAmount(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return "";
  return parsed.toString();
}

function shortHash(hash: string) {
  if (!hash) return "";
  return `${hash.slice(0, 10)}...${hash.slice(-8)}`;
}

function readWalletStatus(flow: DepositFlowViewModel) {
  if (!flow.isConnected) return "Not Connected";
  if (!flow.isAppChain) return "Solana RPC Missing";
  return "Solana Connected";
}

function readPrimaryLabel(flow: DepositFlowViewModel) {
  if (flow.isDepositBusy) return "PROCESSING...";
  if (flow.isApproveBusy) return "APPROVING...";
  if (flow.needsApproval) return "DEPOSIT";
  return "DEPOSIT TO VAULT";
}

export function ManageMoneyPage() {
  const flow = useDepositFlow();

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const previousHtmlTouchAction = html.style.touchAction;
    const previousBodyTouchAction = body.style.touchAction;

    // The game shell disables touch gestures globally, so re-enable vertical scrolling here.
    html.style.touchAction = "pan-y";
    body.style.touchAction = "pan-y";

    return () => {
      html.style.touchAction = previousHtmlTouchAction;
      body.style.touchAction = previousBodyTouchAction;
    };
  }, []);

  const returnHref = "/";
  const returnLabel = "HOME";
  const walletPreset = readQuickAmount(flow.walletBalanceDisplay);
  const vaultPreset = readQuickAmount(flow.availableBalanceDisplay);

  const quickAmounts = useMemo<QuickAmountPreset[]>(() => {
    const presets: QuickAmountPreset[] = [
      { label: "$10", value: "10" },
      { label: "$25", value: "25" },
      { label: "$50", value: "50" },
      { label: "$100", value: "100" },
    ];

    if (walletPreset) {
      presets.push({ label: "$WALLET MAX", value: walletPreset });
    }

    if (vaultPreset) {
      presets.push({ label: "$VAULT MAX", value: vaultPreset });
    }

    return presets;
  }, [vaultPreset, walletPreset]);

  const activityItems = useMemo<ActivityItem[]>(
    () =>
      [
        {
