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

// TODO: refactor this section later
console.log('debugging...');
