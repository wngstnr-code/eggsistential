import {
  CP_INTERVAL,
  SEGMENT_TIME_MS,
  DECAY_BP_PER_SEC,
  MIN_MOVE_INTERVAL_MS,
  MAX_MOVES_PER_WINDOW,
  MOVE_WINDOW_MS,
} from "../config/constants.js";

/**
 * Pure game validation functions.
 * No side effects — all calculations are deterministic.
 */

// ── Multiplier Calculation ───────────────────────────────────

/**
 * Check if the interval between moves is reasonable.
 * A human cannot press keys faster than ~120ms consistently.
 *
 * @returns true if the move is suspicious (too fast)
 */
export function isMoveToFast(lastMoveTime: number, now: number): boolean {
  if (lastMoveTime === 0) return false; // First move
  return (now - lastMoveTime) < MIN_MOVE_INTERVAL_MS;
}

/**
 * Check if move frequency exceeds human limits.
 * If a player makes >40 moves in 5 seconds, it's likely a bot/macro.
 *
 * @returns true if cheating detected
 */
export function isSpeedHack(
  moveTimestamps: number[],
  maxMoves: number = MAX_MOVES_PER_WINDOW,
  windowMs: number = MOVE_WINDOW_MS
): boolean {
  if (moveTimestamps.length < maxMoves) return false;

  // Check the last N moves
  const recentMoves = moveTimestamps.slice(-maxMoves);
  const timeSpan = recentMoves[recentMoves.length - 1] - recentMoves[0];

  return timeSpan < windowMs;
}

// ── Decay Calculation ────────────────────────────────────────

/**
 * Calculate the decay penalty in basis points.
 * After segment time is up, multiplier decays at -0.1x per second.
 *
 * @param segmentStart - Timestamp when segment started
 * @param now - Current timestamp
 * @returns decay amount in basis points (always >= 0)
 */
export function calculateDecayBp(segmentStart: number, now: number): number {
  const elapsed = now - segmentStart;
  const overtime = elapsed - SEGMENT_TIME_MS;

  if (overtime <= 0) return 0;

  return Math.floor((DECAY_BP_PER_SEC * overtime) / 1000);
}

/**
 * Get effective multiplier after applying decay.
 *
 * @param baseMultiplierBp - Multiplier before decay
 * @param segmentStart - When current segment started
 * @param now - Current time
 * @returns effective multiplier in basis points (min 0)
 */
export function getEffectiveMultiplierBp(
  baseMultiplierBp: number,
  segmentStart: number,
  now: number
): number {
  const decay = calculateDecayBp(segmentStart, now);
  return Math.max(0, baseMultiplierBp - decay);
}

// ── Payout Calculation ───────────────────────────────────────

/**
 * Check if a row index is a checkpoint.
 */
export function isCheckpointRow(rowIndex: number): boolean {
  return rowIndex > 0 && rowIndex % CP_INTERVAL === 0;
}
