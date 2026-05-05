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
          label: "Latest Token Approval",
          hash: flow.approveTxHash,
          url: flow.approveTxUrl,
        },
        {
          label: "Latest Deposit",
          hash: flow.depositTxHash,
          url: flow.depositTxUrl,
        },
        {
          label: "Latest Withdraw",
          hash: flow.withdrawTxHash,
          url: flow.withdrawTxUrl,
        },
        {
          label: "Latest Faucet",
          hash: flow.faucetTxHash,
          url: flow.faucetTxUrl,
        },
      ].filter((item) => item.hash),
    [
      flow.approveTxHash,
      flow.approveTxUrl,
      flow.depositTxHash,
      flow.depositTxUrl,
      flow.withdrawTxHash,
      flow.withdrawTxUrl,
      flow.faucetTxHash,
      flow.faucetTxUrl,
    ],
  );

  async function handleDepositClick() {
    try {
      await flow.onDeposit();
    } catch {
      // Error sudah ditangani oleh flow.
    }
  }

  async function handleWithdrawClick() {
    try {
      await flow.onWithdraw();
    } catch {
      // Error sudah ditangani oleh flow.
    }
  }

  async function handleFaucetClick() {
    try {
      await flow.onRequestFaucet();
    } catch {
      // Error sudah ditangani oleh flow.
    }
  }

  return (
    <main className="flow-page money-page">
      <div className="money-bg" aria-hidden="true">
        <iframe
          className="money-bg-frame"
          src="/play?bg=1"
          title="In-game background"
          tabIndex={-1}
        />
      </div>
      <div className="money-overlay" aria-hidden="true" />

      <section className="flow-card money-card">
        <header className="money-header">
          <div className="money-head-top">
            <p className="flow-eyebrow">EGGSISTENTIAL VAULT</p>
            <div className="money-head-badges">
              <span
                className={`money-head-badge ${
                  flow.needsApproval
                    ? "money-head-badge-warning"
                    : "money-head-badge-ready"
                }`}
              >
                {flow.needsApproval ? "APPROVAL NEEDED" : "VAULT READY"}
              </span>
            </div>
          </div>
          <h1 className="flow-title money-title">MANAGE MONEY</h1>
          <p className="money-subtitle">
            Deposit to vault, then withdraw only from your available balance.
          </p>
        </header>

        <div className="money-grid">
          <section className="flow-status money-status-panel">
            <p className="money-section-label">VAULT SNAPSHOT</p>
            <div className="money-status-grid">
              <div className="money-status-row">
