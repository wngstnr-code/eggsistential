import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { env } from "../config/env.js";
import { backendSignerKeypair, connection } from "../lib/solana.js";

export async function readBackendSignerHealth() {
  const relayerAddress = backendSignerKeypair.publicKey.toBase58();
  const lamports = await connection.getBalance(backendSignerKeypair.publicKey);
  const balanceNative = lamports / LAMPORTS_PER_SOL;

  return {
    relayerAddress,
    balanceWei: lamports.toString(),
    balanceNative,
    nativeSymbol: env.NATIVE_TOKEN_SYMBOL,
    healthy: balanceNative >= env.MIN_RECOMMENDED_NATIVE_BALANCE,
    minRecommendedNative: env.MIN_RECOMMENDED_NATIVE_BALANCE,
  };
}
