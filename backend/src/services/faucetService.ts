import {
  createPublicClient,
  createWalletClient,
  http,
  isAddress,
  parseAbi,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { env } from "../config/env.js";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const FAUCET_ABI = parseAbi([
  "function drip()",
  "function drip(address to)",
  "function faucet(address to, uint256 amount)",
  "function mint(address to, uint256 amount)",
  "function claim(address to, uint256 amount)",
]);

const lastFaucetAtMsByWallet = new Map<string, number>();

const faucetPublicClient = createPublicClient({
  transport: http(env.RPC_URL),
});

const faucetAccount = privateKeyToAccount(env.BACKEND_PRIVATE_KEY as Hex);
const faucetWalletClient = createWalletClient({
  account: faucetAccount,
  transport: http(env.RPC_URL),
});

type FaucetMode =
  | "drip_to"
  | "drip_self"
  | "faucet_to_amount"
  | "mint_to_amount"
  | "claim_to_amount";

function readFaucetMode(): FaucetMode {
  const mode = String(env.FAUCET_MODE || "drip_to").trim().toLowerCase();
  if (mode === "drip_self") return "drip_self";
  if (mode === "faucet_to_amount") return "faucet_to_amount";
  if (mode === "mint_to_amount") return "mint_to_amount";
  if (mode === "claim_to_amount") return "claim_to_amount";
  return "drip_to";
}

function readFaucetAmountUnits() {
  try {
    const parsed = BigInt(String(env.FAUCET_AMOUNT_UNITS || "0"));
    return parsed > 0n ? parsed : 0n;
  } catch {
    return 0n;
  }
}

function readCooldownMs() {
  return Math.max(0, env.FAUCET_COOLDOWN_SECONDS) * 1000;
}

export function isFaucetConfigured() {
  return (
    isAddress(env.FAUCET_CONTRACT_ADDRESS) &&
    env.FAUCET_CONTRACT_ADDRESS.toLowerCase() !== ZERO_ADDRESS
  );
}

export function readFaucetStatus(walletAddress?: string) {
  const now = Date.now();
  const cooldownMs = readCooldownMs();
  const normalizedWallet = String(walletAddress || "").toLowerCase();
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
    cooldownSeconds: Math.floor(cooldownMs / 1000),
    remainingSeconds: Math.ceil(remainingMs / 1000),
    nextEligibleAt:
      remainingMs > 0 ? new Date(nextEligibleAtMs).toISOString() : null,
  };
}

function ensureFaucetReady() {
  if (!isFaucetConfigured()) {
    throw new Error(
      "Faucet belum dikonfigurasi di backend. Isi FAUCET_CONTRACT_ADDRESS dulu.",
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
  lastFaucetAtMsByWallet.set(walletAddress.toLowerCase(), Date.now());
}

export async function requestFaucetForWallet(walletAddress: string) {
  ensureFaucetReady();

  const faucetAddress = env.FAUCET_CONTRACT_ADDRESS as Address;
  const targetWallet = walletAddress.toLowerCase() as Address;
  const mode = readFaucetMode();
  const amountUnits = readFaucetAmountUnits();

  let txHash: Hex;

  if (mode === "drip_self") {
    txHash = await faucetWalletClient.writeContract({
      chain: null,
      address: faucetAddress,
      abi: FAUCET_ABI,
      functionName: "drip",
      args: [],
    });
  } else if (mode === "faucet_to_amount") {
    txHash = await faucetWalletClient.writeContract({
      chain: null,
      address: faucetAddress,
      abi: FAUCET_ABI,
      functionName: "faucet",
      args: [targetWallet, amountUnits],
    });
  } else if (mode === "mint_to_amount") {
    txHash = await faucetWalletClient.writeContract({
      chain: null,
      address: faucetAddress,
      abi: FAUCET_ABI,
      functionName: "mint",
      args: [targetWallet, amountUnits],
    });
  } else if (mode === "claim_to_amount") {
    txHash = await faucetWalletClient.writeContract({
      chain: null,
      address: faucetAddress,
      abi: FAUCET_ABI,
      functionName: "claim",
      args: [targetWallet, amountUnits],
    });
  } else {
    txHash = await faucetWalletClient.writeContract({
      chain: null,
      address: faucetAddress,
      abi: FAUCET_ABI,
      functionName: "drip",
      args: [targetWallet],
    });
  }

  const receipt = await faucetPublicClient.waitForTransactionReceipt({
    hash: txHash,
  });

  if (receipt.status !== "success") {
    throw new Error("Faucet transaction reverted.");
  }

  markFaucetRequested(targetWallet);
  const nextStatus = readFaucetStatus(targetWallet);

  return {
    txHash,
    mode: nextStatus.mode,
    cooldownSeconds: nextStatus.cooldownSeconds,
    nextEligibleAt: nextStatus.nextEligibleAt,
  };
}
