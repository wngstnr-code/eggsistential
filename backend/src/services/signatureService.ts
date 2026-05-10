import { randomBytes } from "node:crypto";
import { env } from "../config/env.js";
import { backendSignerKeypair } from "../lib/solana.js";



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
