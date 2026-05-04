import { PublicKey } from "@solana/web3.js";

export function isValidSolanaAddress(value: string): boolean {
  try {
    const parsed = new PublicKey(value);
    return parsed.toBase58() === value;
  } catch {
    return false;
  }
}

export function normalizeSolanaAddress(value: string): string {
  return new PublicKey(value).toBase58();
}
