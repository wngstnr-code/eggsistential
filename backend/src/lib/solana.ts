import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { createHash } from "node:crypto";
import bs58 from "bs58";
import { env } from "../config/env.js";

export const PROGRAM_ID = new PublicKey(env.PROGRAM_ID);
export const TOKEN_MINT = new PublicKey(env.TOKEN_MINT);
export const VAULT_TOKEN_ACCOUNT = new PublicKey(env.VAULT_TOKEN_ACCOUNT);

export const [CONFIG_PDA] = PublicKey.findProgramAddressSync(
  [Buffer.from("config")],
  PROGRAM_ID,
);
export const [VAULT_AUTHORITY_PDA] = PublicKey.findProgramAddressSync(
  [Buffer.from("vault-authority")],
  PROGRAM_ID,
);

export const connection = new Connection(env.RPC_URL, "confirmed");

export const backendSignerKeypair: Keypair = (() => {
  if (!env.BACKEND_PRIVATE_KEY) {
    throw new Error("BACKEND_PRIVATE_KEY is required to sign Solana transactions");
  }
  const secret = bs58.decode(env.BACKEND_PRIVATE_KEY);
  if (secret.length !== 64) {
    throw new Error(
      `BACKEND_PRIVATE_KEY must decode to 64 bytes, got ${secret.length}`,
    );
  }
  return Keypair.fromSecretKey(secret);
})();

export function anchorDiscriminator(name: string): Buffer {
  return createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
}

export function playerBalancePda(player: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("player-balance"), player.toBuffer()],
    PROGRAM_ID,
  );
  return pda;
}

export function sessionPda(sessionId: Buffer): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("session"), sessionId],
    PROGRAM_ID,
  );
  return pda;
}

/** Accepts hex (with or without 0x) or base58 — returns exactly 32 bytes. */
export function normalizeSessionId(value: string): Buffer {
  const trimmed = value.trim();
  if (/^0x[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed.slice(2), "hex");
  }
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, "hex");
  }
  try {
    const decoded = bs58.decode(trimmed);
    if (decoded.length === 32) return Buffer.from(decoded);
  } catch {
    // fall through
  }
  throw new Error(`sessionId must be 32 bytes (hex or base58), got "${value}"`);
}

export function buildSettleSessionIx(params: {
  sessionId: Buffer;
  player: PublicKey;
  stakeAmount: bigint;
  payoutAmount: bigint;
  finalMultiplierBp: bigint;
  outcome: number;
  deadline: bigint;
}): TransactionInstruction {
  const data = Buffer.alloc(8 + 32 + 32 + 8 + 8 + 8 + 1 + 8);
  let off = 0;
  anchorDiscriminator("settle_session").copy(data, off); off += 8;
  params.sessionId.copy(data, off); off += 32;
  params.player.toBuffer().copy(data, off); off += 32;
  data.writeBigUInt64LE(params.stakeAmount, off); off += 8;
  data.writeBigUInt64LE(params.payoutAmount, off); off += 8;
  data.writeBigUInt64LE(params.finalMultiplierBp, off); off += 8;
  data.writeUInt8(params.outcome, off); off += 1;
  data.writeBigInt64LE(params.deadline, off);

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: CONFIG_PDA, isSigner: false, isWritable: true },
      { pubkey: backendSignerKeypair.publicKey, isSigner: true, isWritable: false },
      { pubkey: playerBalancePda(params.player), isSigner: false, isWritable: true },
      { pubkey: sessionPda(params.sessionId), isSigner: false, isWritable: true },
    ],
    data,
  });
}

export const SystemProgramId = SystemProgram.programId;

export function playerAssociatedTokenAccount(player: PublicKey): PublicKey {
  return getAssociatedTokenAddressSync(TOKEN_MINT, player);
}

export function buildClaimFaucetIx(player: PublicKey): TransactionInstruction {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: CONFIG_PDA, isSigner: false, isWritable: false },
      { pubkey: TOKEN_MINT, isSigner: false, isWritable: true },
      { pubkey: VAULT_AUTHORITY_PDA, isSigner: false, isWritable: false },
      { pubkey: VAULT_TOKEN_ACCOUNT, isSigner: false, isWritable: true },
      { pubkey: player, isSigner: true, isWritable: true },
      { pubkey: playerAssociatedTokenAccount(player), isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: anchorDiscriminator("claim_faucet"),
  });
}

/**
 * Builds an unsigned transaction that the player wallet will sign and submit:
 *   1. Idempotent ATA creation (no-op if already exists)
 *   2. claim_faucet (mints FAUCET_AMOUNT to player ATA)
 * Returns base64-serialized transaction ready to be deserialized by a wallet.
 */
export async function buildClaimFaucetTransaction(player: PublicKey): Promise<string> {
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  const tx = new Transaction({
    feePayer: player,
    blockhash,
    lastValidBlockHeight,
  });
  tx.add(
    createAssociatedTokenAccountIdempotentInstruction(
      player,
      playerAssociatedTokenAccount(player),
      player,
      TOKEN_MINT,
    ),
    buildClaimFaucetIx(player),
  );
  return tx
    .serialize({ requireAllSignatures: false, verifySignatures: false })
    .toString("base64");
}

export { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID };
