import { PublicKey } from "@solana/web3.js";
import { createHash } from "node:crypto";
import { env } from "../config/env.js";
import { supabase } from "../config/supabase.js";
import { connection, PROGRAM_ID } from "../lib/solana.js";

type TransactionType =
  | "DEPOSIT"
  | "WITHDRAW"
  | "TREASURY_FUNDED"
  | "SESSION_STARTED"
  | "SESSION_SETTLED";

let isListening = false;
let subscriptionId: number | null = null;

function eventDiscriminator(eventName: string): Buffer {
  return createHash("sha256").update(`event:${eventName}`).digest().subarray(0, 8);
}

const DISCRIMINATORS = {
  Deposited: eventDiscriminator("Deposited"),
  Withdrawn: eventDiscriminator("Withdrawn"),
  TreasuryFunded: eventDiscriminator("TreasuryFunded"),
  SessionStarted: eventDiscriminator("SessionStarted"),
  SessionSettled: eventDiscriminator("SessionSettled"),
};

function unitsToToken(amount: bigint): number {
  return Number(amount) / 10 ** env.TOKEN_DECIMALS;
}

async function ensurePlayer(walletAddress: string) {
  const { error } = await supabase
    .from("players")
    .upsert({ wallet_address: walletAddress }, { onConflict: "wallet_address" });
  if (error) {
    console.error(`❌ Failed to ensure player ${walletAddress}:`, error);
  }
}

async function logTransaction(params: {
  txHash: string;
  walletAddress: string;
  type: TransactionType;
  amount: number;
  onchainSessionId?: string;
}) {
  const { error } = await supabase.from("transactions").upsert(
    {
      tx_hash: params.txHash,
      wallet_address: params.walletAddress,
      type: params.type,
      amount: params.amount,
      onchain_session_id: params.onchainSessionId ?? null,
    },
    { onConflict: "tx_hash" },
  );
  if (error) {
    console.error(`❌ Failed to log transaction ${params.txHash}:`, error);
  }
}

function readPubkey(data: Buffer, offset: number): string {
  return new PublicKey(data.subarray(offset, offset + 32)).toBase58();
}

function readSessionIdHex(data: Buffer, offset: number): string {
  return `0x${data.subarray(offset, offset + 32).toString("hex")}`;
}

async function handleEventData(eventData: Buffer, signature: string) {
  if (eventData.length < 8) return;
  const discriminator = eventData.subarray(0, 8);
  const body = eventData.subarray(8);

  if (discriminator.equals(DISCRIMINATORS.Deposited) && body.length >= 40) {
    const player = readPubkey(body, 0);
    const amount = body.readBigUInt64LE(32);
    await ensurePlayer(player);
    await logTransaction({
      txHash: signature,
      walletAddress: player,
      type: "DEPOSIT",
      amount: unitsToToken(amount),
    });
    return;
  }

  if (discriminator.equals(DISCRIMINATORS.Withdrawn) && body.length >= 40) {
    const player = readPubkey(body, 0);
    const amount = body.readBigUInt64LE(32);
    await ensurePlayer(player);
    await logTransaction({
      txHash: signature,
      walletAddress: player,
      type: "WITHDRAW",
      amount: unitsToToken(amount),
    });
    return;
  }

  if (discriminator.equals(DISCRIMINATORS.TreasuryFunded) && body.length >= 40) {
    const funder = readPubkey(body, 0);
    const amount = body.readBigUInt64LE(32);
    await ensurePlayer(funder);
    await logTransaction({
      txHash: signature,
      walletAddress: funder,
      type: "TREASURY_FUNDED",
      amount: unitsToToken(amount),
    });
    return;
  }

  if (discriminator.equals(DISCRIMINATORS.SessionStarted) && body.length >= 72) {
    const player = readPubkey(body, 0);
    const sessionId = readSessionIdHex(body, 32);
    const stake = body.readBigUInt64LE(64);
    await ensurePlayer(player);
    await logTransaction({
      txHash: signature,
      walletAddress: player,
      type: "SESSION_STARTED",
      amount: unitsToToken(stake),
      onchainSessionId: sessionId,
    });
    return;
  }

  if (discriminator.equals(DISCRIMINATORS.SessionSettled) && body.length >= 89) {
    const player = readPubkey(body, 0);
    const sessionId = readSessionIdHex(body, 32);
    const outcome = body.readUInt8(64);
    // stake at 65..73, payout at 73..81, multiplier at 81..89
    const payout = body.readBigUInt64LE(73);
    const finalMultiplierBp = body.readBigUInt64LE(81);
    await ensurePlayer(player);

    await supabase
      .from("game_sessions")
      .update({
        settlement_tx_hash: signature,
        final_multiplier: Number(finalMultiplierBp) / 10_000,
        payout_amount: unitsToToken(payout),
        status: outcome === 1 ? "CASHED_OUT" : "CRASHED",
      })
      .eq("wallet_address", player)
      .eq("onchain_session_id", sessionId);

    await logTransaction({
      txHash: signature,
      walletAddress: player,
      type: "SESSION_SETTLED",
      amount: unitsToToken(payout),
      onchainSessionId: sessionId,
    });
  }
}

function isValidPubkey(value: string): boolean {
  try {
    new PublicKey(value);
    return true;
  } catch {
    return false;
  }
}

export async function startBlockchainListener(): Promise<void> {
  if (isListening) return;

  if (!env.PROGRAM_ID || !isValidPubkey(env.PROGRAM_ID)) {
    console.log("⚠️  Blockchain listener SKIPPED — PROGRAM_ID belum dikonfigurasi.");
    return;
  }

  try {
    console.log(`🔗 Starting Solana log listener on ${env.RPC_URL}`);
    console.log(`   Program: ${PROGRAM_ID.toBase58()}`);

    subscriptionId = connection.onLogs(
      PROGRAM_ID,
      async (logsResult) => {
        if (logsResult.err) return;

        for (const line of logsResult.logs) {
          if (!line.startsWith("Program data: ")) continue;
          const base64 = line.slice("Program data: ".length).trim();
          if (!base64) continue;
          try {
            const eventData = Buffer.from(base64, "base64");
            await handleEventData(eventData, logsResult.signature);
          } catch (err) {
            console.error("❌ Failed to handle program log event:", err);
          }
        }
      },
      "confirmed",
    );

    isListening = true;
    console.log("✅ Solana log listener active");
  } catch (err) {
    console.error("❌ Failed to start Solana log listener:", err);
    console.log("   Backend will continue without blockchain events.");
  }
}

export async function stopBlockchainListener(): Promise<void> {
  if (subscriptionId !== null) {
    try {
      await connection.removeOnLogsListener(subscriptionId);
    } catch (err) {
      console.error("⚠️  Error removing log listener:", err);
    }
    subscriptionId = null;
  }
  isListening = false;
}
