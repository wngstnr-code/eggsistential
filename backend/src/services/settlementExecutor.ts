import {
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  backendSignerKeypair,
  buildSettleSessionIx,
  connection,
  normalizeSessionId,
} from "../lib/solana.js";

type SettlementResolutionInput = {
  sessionId: string;
  player: string;
  stakeAmount: string | number | bigint;
  payoutAmount: string | number | bigint;
  finalMultiplierBp: string | number | bigint;
  outcome: string | number;
  deadline: string | number | bigint;
};

export function getSettlementRelayerAddress(): string {
  return backendSignerKeypair.publicKey.toBase58();
}

function toBigIntValue(value: string | number | bigint) {
  if (typeof value === "bigint") return value;
  return BigInt(String(value || "0"));
}

function readRpcErrorMessage(error: unknown) {
  return String(
    (error as { message?: string })?.message ||
      (error as { toString?: () => string })?.toString?.() ||
      "",
  ).toLowerCase();
}

function isTransientRpcError(error: unknown) {
  const message = readRpcErrorMessage(error);
  return (
    message.includes("too many requests") ||
    message.includes("rate limit") ||
    message.includes("429") ||
    message.includes("fetch failed") ||
    message.includes("failed to fetch") ||
    message.includes("network") ||
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("socket") ||
    message.includes("blockhash not found")
  );
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function withRpcRetry<T>(
  fn: () => Promise<T>,
  options: { retries?: number; baseDelayMs?: number } = {},
): Promise<T> {
  const retries = options.retries ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 250;
  let attempt = 0;

  while (true) {
    try {
      return await fn();
    } catch (error) {
      if (!isTransientRpcError(error) || attempt >= retries) throw error;
      const jitter = Math.floor(Math.random() * 140);
      await sleep(baseDelayMs * Math.pow(2, attempt) + jitter);
      attempt += 1;
    }
  }
}

function normalizeResolution(resolution: SettlementResolutionInput) {
  const sessionIdBytes = normalizeSessionId(resolution.sessionId);
  const player = new PublicKey(String(resolution.player).trim());
  const outcomeNum = Number(resolution.outcome);
  if (outcomeNum !== 1 && outcomeNum !== 2) {
    throw new Error(`Invalid resolution.outcome: ${resolution.outcome}`);
  }
  return {
    sessionId: sessionIdBytes,
    player,
    stakeAmount: toBigIntValue(resolution.stakeAmount),
    payoutAmount: toBigIntValue(resolution.payoutAmount),
    finalMultiplierBp: toBigIntValue(resolution.finalMultiplierBp),
    outcome: outcomeNum,
    deadline: toBigIntValue(resolution.deadline),
  };
}

/**
 * Submits a settle_session instruction to the Anchor program.
 * The `signature` param is accepted for API compatibility with the legacy EVM
 * flow but is ignored — the backend signer signs the Solana transaction directly.
 */
export async function submitSettlementOnchain(params: {
  resolution: SettlementResolutionInput;
  signature?: string;
}): Promise<string> {
  const normalized = normalizeResolution(params.resolution);

  const ix = buildSettleSessionIx(normalized);
  const tx = new Transaction().add(ix);

  return withRpcRetry(
    () =>
      sendAndConfirmTransaction(connection, tx, [backendSignerKeypair], {
        commitment: "confirmed",
      }),
    { retries: 3, baseDelayMs: 400 },
  );
}
