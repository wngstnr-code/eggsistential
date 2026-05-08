"use client";

import type { ChangeEvent } from "react";
import { useEffect, useMemo, useState } from "react";
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

type MoneyActionMode = "deposit" | "withdraw" | "faucet";

type ManageMoneyVaultCardProps = {
  className?: string;
  onClose?: () => void;
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
  if (!flow.isAppChain) return "RPC Missing";
  return "Connected";
}

function readPrimaryLabel(flow: DepositFlowViewModel) {
  if (flow.isDepositBusy) return "PROCESSING...";
  if (flow.isApproveBusy) return "APPROVING...";
  return "DEPOSIT";
}

export function ManageMoneyVaultCard({
  className = "",
  onClose,
}: ManageMoneyVaultCardProps) {
  const flow = useDepositFlow();
  const [moneyAction, setMoneyAction] = useState<MoneyActionMode>("deposit");

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
    }
  }

  async function handleWithdrawClick() {
    try {
      await flow.onWithdraw();
    } catch {
    }
  }

  async function handleFaucetClick() {
    try {
      await flow.onRequestFaucet();
    } catch {
    }
  }

  async function handlePrimaryActionClick() {
    if (moneyAction === "withdraw") {
      await handleWithdrawClick();
      return;
    }

    if (moneyAction === "faucet") {
      await handleFaucetClick();
      return;
    }

    await handleDepositClick();
  }

  const moneyActionTabs: Array<{ mode: MoneyActionMode; label: string }> = [
    { mode: "deposit", label: "DEPOSIT" },
    { mode: "withdraw", label: "WITHDRAW" },
    { mode: "faucet", label: "FAUCET" },
  ];

  const activeActionLabel =
    moneyAction === "withdraw"
      ? flow.isWithdrawBusy
        ? "WITHDRAWING..."
        : "WITHDRAW"
      : moneyAction === "faucet"
        ? flow.isFaucetBusy
          ? "CLAIMING..."
          : "CLAIM FAUCET"
        : readPrimaryLabel(flow);

  const activeActionDisabled =
    moneyAction === "withdraw"
      ? flow.disableWithdrawButton
      : moneyAction === "faucet"
        ? flow.disableFaucetButton
        : flow.disableDepositButton;

  return (
    <section className={["flow-card money-card", className].filter(Boolean).join(" ")}>
      {onClose ? (
        <button
          className="close-btn money-card-close"
          type="button"
          aria-label="Close vault"
          onClick={onClose}
        >
          X
        </button>
      ) : null}
      <header className="money-header">
        <div className="money-head-top">
          <p className="flow-eyebrow">EGGSISTENTIAL VAULT</p>
        </div>
        <h1 className="flow-title money-title">MY VAULT</h1>
        <p className="money-subtitle">
          Deposit to vault, then withdraw only from your available balance.
        </p>
      </header>

        <div className="money-grid">
          <section className="flow-status money-status-panel">
            <p className="money-section-label">VAULT SNAPSHOT</p>
            <div className="money-status-grid">
              <div className="money-status-row">
                <span>Wallet Status</span>
                <strong>{readWalletStatus(flow)}</strong>
              </div>
              <div className="money-status-row">
                <span>Wallet Balance</span>
                <strong>{flow.walletBalanceDisplay === "-" ? "-" : `$${flow.walletBalanceDisplay}`}</strong>
              </div>
              <div className="money-status-row">
                <span>Vault Available</span>
                <strong>{flow.availableBalanceDisplay === "-" ? "-" : `$${flow.availableBalanceDisplay}`}</strong>
              </div>
              <div className="money-status-row">
                <span>Vault Locked</span>
                <strong>{flow.lockedBalanceDisplay === "-" ? "-" : `$${flow.lockedBalanceDisplay}`}</strong>
              </div>
            </div>
          </section>

          <section className="money-action-panel">
            <div className="money-action-tabs" role="tablist" aria-label="Vault actions">
              {moneyActionTabs.map((tab) => (
                <button
                  key={tab.mode}
                  type="button"
                  role="tab"
                  aria-selected={moneyAction === tab.mode}
                  className={`money-action-tab${
                    moneyAction === tab.mode ? " active" : ""
                  }`}
                  onClick={() => setMoneyAction(tab.mode)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="money-message-stack">
              {flow.configMessage ? (
                <p className="flow-alert">{flow.configMessage}</p>
              ) : null}
              {flow.statusMessage ? (
                <p className="flow-success">{flow.statusMessage}</p>
              ) : null}
              {flow.errorMessage ? (
                <p className="flow-alert">{flow.errorMessage}</p>
              ) : null}
            </div>

            <div className="money-amount-block">
              <label className="flow-label" htmlFor="money-amount-ui">
                AMOUNT (USDC)
              </label>
              <input
                id="money-amount-ui"
                className="flow-input money-input"
                type="number"
                min="0"
                step="0.01"
                placeholder="10.00"
                value={flow.amount}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  flow.setAmount(event.target.value)
                }
              />

              <div className="money-quick-picks">
                {quickAmounts.map((preset) => (
                  <button
                    key={`${preset.label}-${preset.value}`}
                    type="button"
                    className="money-quick-pick"
                    onClick={() => flow.setAmount(preset.value)}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <button
              className="flow-btn money-primary-btn"
              type="button"
              disabled={activeActionDisabled}
              onClick={handlePrimaryActionClick}
            >
              {activeActionLabel}
            </button>

            {moneyAction === "faucet" && flow.faucetCooldownSeconds > 0 ? (
              <p className="money-helper">
                Faucet cooldown per wallet: {flow.faucetCooldownSeconds}s
              </p>
            ) : null}

            {!onClose ? (
              <div className="money-panel-footer">
                <div className="money-footer-actions">
                  <a
                    href={returnHref}
                    className="flow-btn money-nav-home-btn money-panel-nav-btn"
                  >
                    {returnLabel}
                  </a>
                  <a
                    href="/play"
                    className="flow-btn money-nav-play-btn money-panel-nav-btn"
                  >
                    PLAY GAME
                  </a>
                </div>
              </div>
            ) : null}
          </section>
        </div>

        {activityItems.length ? (
          <section className="money-activity">
            <p className="flow-eyebrow money-activity-eyebrow">RECENT ACTIVITY</p>
            <div className="money-activity-list">
              {activityItems.map((item) => (
                <div key={item.label} className="money-activity-item">
                  <span>{item.label}</span>
                  {item.url ? (
                    <a href={item.url} target="_blank" rel="noreferrer">
                      {shortHash(item.hash)}
                    </a>
                  ) : (
                    <span className="mono">{shortHash(item.hash)}</span>
                  )}
                </div>
              ))}
            </div>
          </section>
        ) : null}
    </section>
  );
}

export function ManageMoneyPage() {
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const previousHtmlTouchAction = html.style.touchAction;
    const previousBodyTouchAction = body.style.touchAction;
    html.style.touchAction = "pan-y";
    body.style.touchAction = "pan-y";

    return () => {
      html.style.touchAction = previousHtmlTouchAction;
      body.style.touchAction = previousBodyTouchAction;
    };
  }, []);

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
      <ManageMoneyVaultCard />
    </main>
  );
}
