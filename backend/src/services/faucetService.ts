import { PublicKey } from "@solana/web3.js";
import { env } from "../config/env.js";
import { buildClaimFaucetTransaction } from "../lib/solana.js";

const lastFaucetAtMsByWallet = new Map<string, number>();

type FaucetMode = "claim_faucet";

function readFaucetMode(): FaucetMode {
  return "claim_faucet";
}

function readCooldownMs() {
  return Math.max(0, env.FAUCET_COOLDOWN_SECONDS) * 1000;
}

function formatTokenAmount(unitsValue: string) {
  const units = BigInt(unitsValue || "0");
  const decimals = Math.max(0, env.TOKEN_DECIMALS);
  const divisor = 10n ** BigInt(decimals);
  const whole = units / divisor;
  const frac = units % divisor;

  if (decimals === 0) {
    return whole.toString();
  }

  return `${whole.toString()}.${frac.toString().padStart(decimals, "0")}`;
}

function isValidPubkey(value: string): boolean {
  try {
    new PublicKey(value);
    return true;
  } catch {
    return false;
  }
}

export function isFaucetConfigured() {
  return Boolean(env.PROGRAM_ID) && Boolean(env.TOKEN_MINT) && isValidPubkey(env.PROGRAM_ID);
}

export function readFaucetStatus(walletAddress?: string) {
  const now = Date.now();
  const cooldownMs = readCooldownMs();
  const normalizedWallet = String(walletAddress || "").trim();
  const lastRequestedAt = normalizedWallet
    ? (lastFaucetAtMsByWallet.get(normalizedWallet) ?? 0)
    : 0;
  const nextEligibleAtMs = lastRequestedAt + cooldownMs;
  const remainingMs =
    normalizedWallet && cooldownMs > 0 && nextEligibleAtMs > now
      ? nextEligibleAtMs - now
      : 0;

  return {
    enabled: isFaucetConfigured(),
    mode: readFaucetMode(),
    amount: formatTokenAmount(env.FAUCET_AMOUNT_UNITS),
    amountUnits: env.FAUCET_AMOUNT_UNITS,
    cooldownSeconds: Math.floor(cooldownMs / 1000),
    remainingSeconds: Math.ceil(remainingMs / 1000),
    nextEligibleAt:
      remainingMs > 0 ? new Date(nextEligibleAtMs).toISOString() : null,
  };
}

function ensureFaucetReady() {
  if (!isFaucetConfigured()) {
    throw new Error(
      "Faucet belum dikonfigurasi di backend. Set PROGRAM_ID dan TOKEN_MINT terlebih dahulu.",
    );
  }
}

export function readFaucetCooldownForWallet(walletAddress: string) {
  const status = readFaucetStatus(walletAddress);
  return {
    remainingSeconds: status.remainingSeconds,
    nextEligibleAt: status.nextEligibleAt,
  };
}

function markFaucetRequested(walletAddress: string) {
  lastFaucetAtMsByWallet.set(walletAddress, Date.now());
}

/**
 * Builds an unsigned `claim_faucet` transaction for the player to sign with
 * their wallet. Marks the cooldown timer immediately to prevent abuse.
 */
export async function requestFaucetForWallet(walletAddress: string) {
  ensureFaucetReady();

  if (!isValidPubkey(walletAddress)) {
    throw new Error(`Invalid Solana wallet address: ${walletAddress}`);
  }

  const player = new PublicKey(walletAddress);
  const unsignedTxBase64 = await buildClaimFaucetTransaction(player);

  markFaucetRequested(walletAddress);
  const nextStatus = readFaucetStatus(walletAddress);

  return {
    unsignedTx: unsignedTxBase64,
    mode: nextStatus.mode,
    cooldownSeconds: nextStatus.cooldownSeconds,
    nextEligibleAt: nextStatus.nextEligibleAt,
  };
}
