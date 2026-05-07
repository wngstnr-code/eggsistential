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

// ───── EggPass ────────────────────────────────────────────────────────

export function eggPassPda(player: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("egg-pass"), player.toBuffer()],
    PROGRAM_ID,
  );
  return pda;
}

export function usedNoncePda(nonce: Buffer): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("egg-pass-nonce"), nonce],
    PROGRAM_ID,
  );
  return pda;
}

export interface EggPassClaim {
  tier: number;
  highestCheckpoint: number;
  cp2Cashouts: number;
  cp4Cashouts: number;
  cp6Cashouts: number;
  cp8Cashouts: number;
  reputationScore: number;
  issuedAt: bigint;
  expiry: bigint;
  nonce: Buffer; // 32 bytes
}

export interface EggPassAccount {
  player: string;
  tier: number;
  highestCheckpoint: number;
  cp2Cashouts: number;
  cp4Cashouts: number;
  cp6Cashouts: number;
  cp8Cashouts: number;
  reputationScore: number;
  issuedAt: number;
  expiry: number;
  revoked: boolean;
}

/**
 * Reads and deserializes a player's EggPass account from chain.
 * Returns null if the account doesn't exist yet.
 */
export async function readEggPass(player: PublicKey): Promise<EggPassAccount | null> {
  const pda = eggPassPda(player);
  const acc = await connection.getAccountInfo(pda);
  if (!acc) return null;

  // Skip 8-byte Anchor discriminator
  const data = acc.data;
  let o = 8;
  const playerKey = new PublicKey(data.subarray(o, o + 32)); o += 32;
  const tier = data.readUInt8(o); o += 1;
  const highestCheckpoint = data.readUInt8(o); o += 1;
  const cp2Cashouts = data.readUInt16LE(o); o += 2;
  const cp4Cashouts = data.readUInt16LE(o); o += 2;
  const cp6Cashouts = data.readUInt16LE(o); o += 2;
  const cp8Cashouts = data.readUInt16LE(o); o += 2;
  const reputationScore = data.readUInt16LE(o); o += 2;
  const issuedAt = Number(data.readBigInt64LE(o)); o += 8;
  const expiry = Number(data.readBigInt64LE(o)); o += 8;
  const revoked = data.readUInt8(o) !== 0;

  return {
    player: playerKey.toBase58(),
    tier,
    highestCheckpoint,
    cp2Cashouts,
    cp4Cashouts,
    cp6Cashouts,
    cp8Cashouts,
    reputationScore,
    issuedAt,
    expiry,
    revoked,
  };
}

export function buildClaimEggPassIx(
  player: PublicKey,
  claim: EggPassClaim,
): TransactionInstruction {
  if (claim.nonce.length !== 32) {
    throw new Error(`EggPass nonce must be 32 bytes, got ${claim.nonce.length}`);
  }
  const data = Buffer.alloc(8 + 1 + 1 + 2 + 2 + 2 + 2 + 2 + 8 + 8 + 32);
  let o = 0;
  anchorDiscriminator("claim_egg_pass").copy(data, o); o += 8;
  data.writeUInt8(claim.tier, o); o += 1;
  data.writeUInt8(claim.highestCheckpoint, o); o += 1;
  data.writeUInt16LE(claim.cp2Cashouts, o); o += 2;
  data.writeUInt16LE(claim.cp4Cashouts, o); o += 2;
  data.writeUInt16LE(claim.cp6Cashouts, o); o += 2;
  data.writeUInt16LE(claim.cp8Cashouts, o); o += 2;
  data.writeUInt16LE(claim.reputationScore, o); o += 2;
  data.writeBigInt64LE(claim.issuedAt, o); o += 8;
  data.writeBigInt64LE(claim.expiry, o); o += 8;
  claim.nonce.copy(data, o);

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: CONFIG_PDA, isSigner: false, isWritable: false },
      { pubkey: backendSignerKeypair.publicKey, isSigner: true, isWritable: false },
      { pubkey: player, isSigner: true, isWritable: true },
      { pubkey: eggPassPda(player), isSigner: false, isWritable: true },
      { pubkey: usedNoncePda(claim.nonce), isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

// ───── Read helpers (replaces EVM contract reads) ─────────────────────

const ZERO_SESSION_HEX = `0x${"00".repeat(32)}`;

export interface PlayerBalanceState {
  owner: string;
  availableBalance: bigint;
  lockedBalance: bigint;
  activeSession: string; // 0x-prefixed hex
  bump: number;
}

export async function readPlayerBalance(
  player: PublicKey,
): Promise<PlayerBalanceState | null> {
  const acc = await connection.getAccountInfo(playerBalancePda(player));
  if (!acc) return null;
  const data = acc.data;
  let o = 8;
  const owner = new PublicKey(data.subarray(o, o + 32)).toBase58(); o += 32;
  const availableBalance = data.readBigUInt64LE(o); o += 8;
  const lockedBalance = data.readBigUInt64LE(o); o += 8;
  const activeSession = `0x${data.subarray(o, o + 32).toString("hex")}`; o += 32;
  const bump = data.readUInt8(o);
  return { owner, availableBalance, lockedBalance, activeSession, bump };
}

export interface SessionState {
  sessionId: string; // 0x-prefixed hex
  player: string;
  stakeAmount: bigint;
  startedAt: number;
  active: boolean;
  settled: boolean;
}

export async function readSession(
  sessionIdBytes: Buffer,
): Promise<SessionState | null> {
  const acc = await connection.getAccountInfo(sessionPda(sessionIdBytes));
  if (!acc) return null;
  const data = acc.data;
  let o = 8;
  const sessionId = `0x${data.subarray(o, o + 32).toString("hex")}`; o += 32;
  const player = new PublicKey(data.subarray(o, o + 32)).toBase58(); o += 32;
  const stakeAmount = data.readBigUInt64LE(o); o += 8;
  const startedAt = Number(data.readBigInt64LE(o)); o += 8;
  const active = data.readUInt8(o) !== 0; o += 1;
  const settled = data.readUInt8(o) !== 0;
  return { sessionId, player, stakeAmount, startedAt, active, settled };
}

/**
 * Returns the player's active session if one exists and is still active &
 * unsettled, otherwise null. Replaces the EVM `activeSessionOf` + `getSession`
 * round-trip.
 */
export async function readActiveOnchainSession(walletAddress: string): Promise<{
  sessionId: string;
  player: string;
  stakeAmountUnits: bigint;
} | null> {
  let player: PublicKey;
  try {
    player = new PublicKey(walletAddress);
  } catch {
    return null;
  }

  const balance = await readPlayerBalance(player);
  if (!balance) return null;
  if (balance.activeSession === ZERO_SESSION_HEX) return null;

  const sessionIdBytes = Buffer.from(balance.activeSession.slice(2), "hex");
  const session = await readSession(sessionIdBytes);
  if (!session) return null;
  if (!session.active || session.settled) return null;
  if (session.player !== walletAddress) return null;

  return {
    sessionId: balance.activeSession,
    player: session.player,
    stakeAmountUnits: session.stakeAmount,
  };
}

/**
 * Returns the on-chain status of a Solana transaction by signature.
 * Replaces viem `getTransactionReceipt`. Throws if signature is invalid.
 */
export async function readTransactionStatus(signature: string): Promise<{
  found: boolean;
  success: boolean | null;
}> {
  const tx = await connection.getTransaction(signature, {
    commitment: "confirmed",
    maxSupportedTransactionVersion: 0,
  });
  if (!tx) return { found: false, success: null };
  return { found: true, success: tx.meta?.err == null };
}

export function isZeroSessionId(value: string): boolean {
  return /^0x0{64}$/i.test(value);
}

/**
 * Builds a `claim_egg_pass` transaction signed by the backend authority and
 * serialized for the player's wallet to add their signature and submit.
 * Returns base64-encoded transaction.
 */
export async function buildClaimEggPassTransaction(
  player: PublicKey,
  claim: EggPassClaim,
): Promise<string> {
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  const tx = new Transaction({
    feePayer: player,
    blockhash,
    lastValidBlockHeight,
  });
  tx.add(buildClaimEggPassIx(player, claim));
  tx.partialSign(backendSignerKeypair);
  return tx
    .serialize({ requireAllSignatures: false, verifySignatures: false })
    .toString("base64");
}
