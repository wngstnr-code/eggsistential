import { randomBytes } from "node:crypto";
import { env } from "../config/env.js";
import { backendSignerKeypair } from "../lib/solana.js";

/**
 * Phase 3 of the Solana migration removed the EIP-712 signature scheme.
 * Settlement now signs the Solana transaction directly inside
 * `submitSettlementOnchain`, and EggPass claims build a partially-signed
 * transaction inside the passport route.
 *
 * The exports below remain for caller compatibility with `routes/game.ts`
 * and `gateway/gameGateway.ts`. The legacy `signSettlement` returns a
 * placeholder signature that downstream code already ignores.
 */

export const SETTLEMENT_OUTCOME = {
  CASHED_OUT: 1,
  CRASHED: 2,
} as const;

export interface SignedSettlementResult {
  signature: string;
  resolution: {
    sessionId: string;
    player: string;
    stakeAmount: string;
    payoutAmount: string;
    finalMultiplierBp: string;
    outcome: number;
    deadline: string;
  };
  signerAddress: string;
}

export function generateOnchainSessionId(): string {
  return `0x${randomBytes(32).toString("hex")}`;
}

export function usdcToUint256(amount: number): bigint {
  return BigInt(Math.round(amount * 1_000_000));
}

const PLACEHOLDER_SIGNATURE = `0x${"0".repeat(130)}`;

/**
 * Returns a resolution payload + placeholder signature. The Solana
 * settlement executor signs the transaction itself and ignores this field.
 */
export async function signSettlement(params: {
  playerAddress: string;
  onchainSessionId: string;
  stakeAmount: number;
  payoutAmount: number;
  finalMultiplierBp: number;
  outcome: number;
  deadline?: number;
}): Promise<SignedSettlementResult> {
  const deadline =
    params.deadline ?? Math.floor(Date.now() / 1000) + env.SETTLEMENT_SIGNATURE_TTL_SECONDS;

  return {
    signature: PLACEHOLDER_SIGNATURE,
    resolution: {
      sessionId: params.onchainSessionId,
      player: params.playerAddress,
      stakeAmount: usdcToUint256(params.stakeAmount).toString(),
      payoutAmount: usdcToUint256(params.payoutAmount).toString(),
      finalMultiplierBp: BigInt(params.finalMultiplierBp).toString(),
      outcome: params.outcome,
      deadline: BigInt(deadline).toString(),
    },
    signerAddress: backendSignerKeypair.publicKey.toBase58(),
  };
}
