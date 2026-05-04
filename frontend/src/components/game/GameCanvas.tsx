import { GameBridgeClient } from "./GameBridgeClient";
import Link from "next/link";
import Script from "next/script";

type GameCanvasProps = {
  backgroundMode?: boolean;
};

export function GameCanvas({ backgroundMode = false }: GameCanvasProps) {
  return (
    <>
      <GameBridgeClient backgroundMode={backgroundMode} />
      <canvas className="game" />

      <div id="loading-screen">
        <div className="loading-content">
          <div className="loading-spinner" aria-hidden="true" />
          <h2>LOADING GAME...</h2>
          <p>Preparing the road ahead</p>
        </div>
      </div>

      <div id="hud-scrim" aria-hidden="true" />

      <div id="top-bar">
        <div id="top-bar-left">
          <div className="stat-card score-card">
            <div className="score-card-main">
              <div className="score-metric">
                <span className="score-meta">HOPS</span>
                <span className="stat-value" id="score">
                  0
                </span>
              </div>
              <div className="hud-divider hud-divider-primary" />
              <div className="score-separator" aria-hidden="true" />
              <div className="hud-divider hud-divider-secondary" />
              <div className="score-metric">
                <span className="score-meta">CURRENT CP</span>
                <span className="score-cp-value" id="score-cp">
                  0
                </span>
              </div>
            </div>
          </div>

          <div id="bet-hud" style={{ display: "block" }}>
            <div
              id="bet-hud-active"
              className="bet-hud-active"
              style={{ display: "none" }}
            >
              <div className="bet-hud-metric-grid">
                <div className="bet-hud-metric bet-hud-metric-primary">
                  <span className="bet-hud-metric-label">STAKE</span>
                  <span id="bet-stake" className="bet-hud-metric-value">
                    $0.00
                  </span>
                </div>
                <div className="bet-hud-metric bet-hud-metric-primary">
                  <span className="bet-hud-metric-label">CASH OUT</span>
                  <span
                    id="bet-payout"
                    className="bet-hud-metric-value payout-value"
                  >
                    $0.00
                  </span>
                </div>
                <div className="bet-hud-metric bet-hud-metric-wide">
                  <span className="bet-hud-metric-label">MULTIPLIER</span>
                  <span
                    id="bet-multiplier"
                    className="bet-hud-metric-value multiplier-value"
                  >
                    0.00x
                  </span>
                </div>
              </div>

              <div
                id="bet-hud-decay"
                className="bet-hud-decay"
                style={{ display: "none" }}
              >
                <span className="bet-hud-decay-label">DECAYING</span>
                <span id="bet-decay" className="bet-hud-decay-value">
                  -0.1x
                </span>
              </div>
            </div>

            <div id="bet-hud-idle" className="bet-hud-idle">
              Start a paid run to see live payout and multiplier.
            </div>

            <button
              id="cash-out-btn"
              className="disabled"
              disabled
              style={{ display: "none" }}
            >
              CASH OUT
            </button>
          </div>
        </div>
        <div id="top-bar-center">
          <div className="stat-card play-balance-card">
            <div className="stat-label">BALANCE</div>
            <div className="stat-value" id="balance">
              $0.00
            </div>
          </div>
          <div className="stat-card timer-card" id="timer-card">
            <div className="stat-label" id="timer-label">
              RUSH
            </div>
            <div className="stat-value" id="timer">
              1:00
            </div>
          </div>
          <button id="bet-btn">PLAY</button>
        </div>
      </div>

      <div id="bet-panel" className="modal-bg">
        <div className="modal-box modal-box-bet">
          <button className="close-btn" id="bet-panel-close" aria-label="Close">
            X
          </button>
          <h2>CONFIRM PAID RUN</h2>
          <p className="subtitle">
            Set your stake, on-chain outcome, checkpoint cash out
          </p>

          <div className="odds-info">
            <div className="field bet-stake-form">
              <label htmlFor="bet-stake-input">AMOUNT (USDC)</label>
              <input
                id="bet-stake-input"
                type="number"
                defaultValue="10"
                min="1"
                max="100"
                step="0.01"
              />
            </div>
            <div className="quick-picks bet-stake-picks" aria-label="Stake presets">
              <button type="button" data-bet-stake="10">
                $10
              </button>
              <button type="button" data-bet-stake="25">
                $25
              </button>
              <button type="button" data-bet-stake="50">
                $50
              </button>
              <button type="button" data-bet-stake="100">
                $100
              </button>
            </div>
          </div>

          <div className="odds-info">
            <p className="odds-title">RUN RULES</p>
            <div className="odds-row">
              <span className="odds-key">Start multiplier</span>
              <strong>0.00x</strong>
            </div>
            <div className="odds-row">
              <span className="odds-key">Per forward step</span>
              <strong>+0.025x</strong>
            </div>
            <div className="odds-row">
              <span className="odds-key">Every 40 steps</span>
              <strong>Checkpoint x1.2</strong>
            </div>
            <div className="odds-row">
              <span className="odds-key">Speed per checkpoint</span>
              <strong>x1.10</strong>
            </div>
            <div className="odds-divider" aria-hidden="true" />
            <div className="odds-note-list">
              <div className="odds-note-item">
                <span className="dot dot-yellow" aria-hidden="true" /> 60s timer
                between checkpoints
              </div>
              <div className="odds-note-item">
                <span className="dot dot-green" aria-hidden="true" /> Cash out
                only while at checkpoint
              </div>
              <div className="odds-note-item">
                <span className="dot dot-red" aria-hidden="true" /> Overtime
                penalty: -0.1x per second
              </div>
            </div>
          </div>

          <div className="modal-actions">
            <button id="start-bet-btn" className="primary">
              START BET
            </button>
            <button id="free-play-btn" className="ghost">
              FREE PRACTICE
            </button>
          </div>
        </div>
      </div>

      <div id="deposit-modal" className="modal-bg" style={{ display: "none" }}>
        <div className="modal-box modal-box-deposit">
          <button className="close-btn" id="deposit-close" aria-label="Close">
            X
          </button>
          <h2>DEPOSIT TO VAULT</h2>

          <div className="field">
            <label>AMOUNT (USDC)</label>
            <input
              type="number"
              id="deposit-amount"
              defaultValue="0.0001"
              min="0.0001"
              step="0.0001"
            />
          </div>

          <div className="quick-picks">
            <button data-deposit="0.0001">0.0001</button>
            <button data-deposit="0.0005">0.0005</button>
            <button data-deposit="0.001">0.0010</button>
            <button data-deposit="0.0025">0.0025</button>
            <button data-deposit="0.005">0.0050</button>
            <button data-deposit="0.01">0.0100</button>
          </div>

          <div className="deposit-balances" id="deposit-balances">
            <p>
              <span>WALLET USDC</span>
              <strong id="deposit-wallet-balance">-</strong>
            </p>
            <p>
              <span>VAULT AVAILABLE</span>
              <strong id="deposit-vault-available">-</strong>
            </p>
            <p>
              <span>VAULT LOCKED</span>
              <strong id="deposit-vault-locked">-</strong>
            </p>
            <p>
              <span>ALLOWANCE</span>
              <strong id="deposit-allowance">-</strong>
            </p>
          </div>

          <p id="deposit-status" className="subtitle" />

          <div className="modal-actions modal-actions-deposit">
            <button id="deposit-confirm" className="primary">
              DEPOSIT NOW
            </button>
            <Link
              id="deposit-manage-funds"
              className="manage"
              href="/managemoney"
            >
              MANAGE MONEY
            </Link>
          </div>
        </div>
      </div>

      <div id="result-container">
