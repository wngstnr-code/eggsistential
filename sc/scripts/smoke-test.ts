/**
 * Smoke test for the deployed eggsistential program on devnet.
 * Runs: claim_faucet → deposit → start_session → settle_session (cashout) → withdraw
 *
 * Uses the admin wallet as both player AND backend_signer for simplicity.
 */
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";

const PROGRAM_ID = new PublicKey("2cATotAz8hga1PfPHXpAeapd1WFMMnB9AgY4DNWjX62k");
const TOKEN_MINT = new PublicKey("HjqwSpFMS9PPWze1DRrq79ZVNUYW2F5SbJuaPs9Djhjy");
const VAULT_TOKEN_ACCOUNT = new PublicKey(
  "FwSf99RYEJJS3h3tigRhG8MFt3uzbJihGi3TcgxL9Kuo",
);

const BASIS_POINTS_SCALE = 10_000n;

function disc(name: string): Buffer {
  return createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
}

function loadKeypair(path: string): Keypair {
  const expanded = path.startsWith("~") ? path.replace("~", homedir()) : path;
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(readFileSync(expanded, "utf8"))),
  );
}

async function send(
  conn: Connection,
  ix: TransactionInstruction | TransactionInstruction[],
  signers: Keypair[],
  label: string,
): Promise<string> {
  const tx = new Transaction().add(...(Array.isArray(ix) ? ix : [ix]));
  const sig = await sendAndConfirmTransaction(conn, tx, signers, {
    commitment: "confirmed",
  });
  console.log(`  ✓ ${label}`, sig);
  return sig;
}

async function tokenBalance(conn: Connection, ata: PublicKey): Promise<bigint> {
  try {
    const acc = await getAccount(conn, ata);
    return acc.amount;
  } catch {
    return 0n;
  }
}

async function main() {
  const rpc = process.env.ANCHOR_PROVIDER_URL ?? "https://api.devnet.solana.com";
  const wallet =
    process.env.ANCHOR_WALLET ?? `${homedir()}/.config/solana/id.json`;
  const conn = new Connection(rpc, "confirmed");
  const player = loadKeypair(wallet);
  const backendSigner = player; // same wallet for smoke test

  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    PROGRAM_ID,
  );
  const [vaultAuthority] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault-authority")],
    PROGRAM_ID,
  );
  const [playerBalancePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("player-balance"), player.publicKey.toBuffer()],
    PROGRAM_ID,
  );
  const playerAta = getAssociatedTokenAddressSync(TOKEN_MINT, player.publicKey);

  console.log("Smoke test on devnet");
  console.log("  player:", player.publicKey.toBase58());
  console.log("  playerBalance PDA:", playerBalancePda.toBase58());
  console.log("  playerATA:", playerAta.toBase58());

  // [-1] Cleanup zombie session from previous failed run
  const pbAcc = await conn.getAccountInfo(playerBalancePda);
  if (pbAcc) {
    const activeSession = pbAcc.data.subarray(8 + 32 + 8 + 8, 8 + 32 + 8 + 8 + 32);
    const lockedBalance = pbAcc.data.readBigUInt64LE(8 + 32 + 8);
    if (!activeSession.every((b) => b === 0)) {
      console.log(
        `\n[-1] cleanup: zombie session detected (locked=${lockedBalance}), settling as crash`,
      );
      const [zombiePda] = PublicKey.findProgramAddressSync(
        [Buffer.from("session"), activeSession],
        PROGRAM_ID,
      );
      const params = Buffer.alloc(32 + 32 + 8 + 8 + 8 + 1 + 8);
      let o = 0;
      activeSession.copy(params, o); o += 32;
      player.publicKey.toBuffer().copy(params, o); o += 32;
      params.writeBigUInt64LE(lockedBalance, o); o += 8;
      params.writeBigUInt64LE(0n, o); o += 8;
      params.writeBigUInt64LE(0n, o); o += 8;
      params.writeUInt8(2, o); o += 1; // OUTCOME_CRASHED
      params.writeBigInt64LE(BigInt(Math.floor(Date.now() / 1000) + 60), o);
      await send(
        conn,
        new TransactionInstruction({
          programId: PROGRAM_ID,
          keys: [
            { pubkey: configPda, isSigner: false, isWritable: true },
            { pubkey: backendSigner.publicKey, isSigner: true, isWritable: false },
            { pubkey: playerBalancePda, isSigner: false, isWritable: true },
            { pubkey: zombiePda, isSigner: false, isWritable: true },
          ],
          data: Buffer.concat([disc("settle_session"), params]),
        }),
        [backendSigner],
        "zombie session crashed",
      );
    }
  }

  // Ensure player ATA exists
  console.log("\n[0] Ensure player ATA");
  await send(
    conn,
    createAssociatedTokenAccountIdempotentInstruction(
      player.publicKey,
      playerAta,
      player.publicKey,
      TOKEN_MINT,
    ),
    [player],
    "ATA ready",
  );

  const before = await tokenBalance(conn, playerAta);
  console.log(`  ATA balance before faucet: ${before}`);

  // [1] claim_faucet
  console.log("\n[1] claim_faucet");
  await send(
    conn,
    new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: configPda, isSigner: false, isWritable: false },
        { pubkey: TOKEN_MINT, isSigner: false, isWritable: true },
        { pubkey: vaultAuthority, isSigner: false, isWritable: false },
        { pubkey: VAULT_TOKEN_ACCOUNT, isSigner: false, isWritable: true },
        { pubkey: player.publicKey, isSigner: true, isWritable: true },
        { pubkey: playerAta, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data: disc("claim_faucet"),
    }),
    [player],
    "faucet claimed",
  );
  const afterFaucet = await tokenBalance(conn, playerAta);
  console.log(`  ATA balance after faucet:  ${afterFaucet} (+${afterFaucet - before})`);

  // [1.5] fund_treasury so cashout step has runway
  const treasuryFund = afterFaucet / 4n;
  console.log(`\n[1.5] fund_treasury ${treasuryFund}`);
  const fundData = Buffer.concat([
    disc("fund_treasury"),
    Buffer.from(new BigUint64Array([treasuryFund]).buffer),
  ]);
  await send(
    conn,
    new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: configPda, isSigner: false, isWritable: true },
        { pubkey: player.publicKey, isSigner: true, isWritable: true },
        { pubkey: playerBalancePda, isSigner: false, isWritable: true },
        { pubkey: TOKEN_MINT, isSigner: false, isWritable: false },
        { pubkey: playerAta, isSigner: false, isWritable: true },
        { pubkey: VAULT_TOKEN_ACCOUNT, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      ],
      data: fundData,
    }),
    [player],
    "treasury funded",
  );

  // [2] deposit (half of remaining)
  const remaining = await tokenBalance(conn, playerAta);
  const depositAmount = remaining / 2n;
  console.log(`\n[2] deposit ${depositAmount}`);
  const depositData = Buffer.concat([
    disc("deposit"),
    Buffer.from(new BigUint64Array([depositAmount]).buffer),
  ]);
  await send(
    conn,
    new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: configPda, isSigner: false, isWritable: true },
        { pubkey: player.publicKey, isSigner: true, isWritable: true },
        { pubkey: playerBalancePda, isSigner: false, isWritable: true },
        { pubkey: TOKEN_MINT, isSigner: false, isWritable: false },
        { pubkey: playerAta, isSigner: false, isWritable: true },
        { pubkey: VAULT_TOKEN_ACCOUNT, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      ],
      data: depositData,
    }),
    [player],
    "deposited",
  );

  // [3] start_session (stake half the deposited)
  const sessionId = randomBytes(32);
  const stakeAmount = depositAmount / 2n;
  console.log(`\n[3] start_session stake=${stakeAmount}`);
  const [sessionPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("session"), sessionId],
    PROGRAM_ID,
  );
  const startData = Buffer.concat([
    disc("start_session"),
    sessionId,
    Buffer.from(new BigUint64Array([stakeAmount]).buffer),
  ]);
  await send(
    conn,
    new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: configPda, isSigner: false, isWritable: true },
        { pubkey: player.publicKey, isSigner: true, isWritable: true },
        { pubkey: playerBalancePda, isSigner: false, isWritable: true },
        { pubkey: sessionPda, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: startData,
    }),
    [player],
    "session started",
  );

  // [4] settle_session (cashout 1.5x)
  const multiplierBp = 15_000n; // 1.5x
  const payout = (stakeAmount * multiplierBp) / BASIS_POINTS_SCALE;
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 60);
  console.log(`\n[4] settle_session cashout=${payout} (1.5x)`);
  const settleParams = Buffer.alloc(32 + 32 + 8 + 8 + 8 + 1 + 8);
  let off = 0;
  sessionId.copy(settleParams, off); off += 32;
  player.publicKey.toBuffer().copy(settleParams, off); off += 32;
  settleParams.writeBigUInt64LE(stakeAmount, off); off += 8;
  settleParams.writeBigUInt64LE(payout, off); off += 8;
  settleParams.writeBigUInt64LE(multiplierBp, off); off += 8;
  settleParams.writeUInt8(1, off); off += 1; // OUTCOME_CASHED_OUT
  settleParams.writeBigInt64LE(deadline, off);

  await send(
    conn,
    new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: configPda, isSigner: false, isWritable: true },
        { pubkey: backendSigner.publicKey, isSigner: true, isWritable: false },
        { pubkey: playerBalancePda, isSigner: false, isWritable: true },
        { pubkey: sessionPda, isSigner: false, isWritable: true },
      ],
      data: Buffer.concat([disc("settle_session"), settleParams]),
    }),
    [backendSigner],
    "session settled",
  );

  // [5] withdraw all available
  const withdrawAmount = payout + (depositAmount - stakeAmount); // payout + leftover available
  console.log(`\n[5] withdraw ${withdrawAmount}`);
  const withdrawData = Buffer.concat([
    disc("withdraw"),
    Buffer.from(new BigUint64Array([withdrawAmount]).buffer),
  ]);
  await send(
    conn,
    new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: configPda, isSigner: false, isWritable: true },
        { pubkey: player.publicKey, isSigner: true, isWritable: true },
        { pubkey: playerBalancePda, isSigner: false, isWritable: true },
        { pubkey: TOKEN_MINT, isSigner: false, isWritable: false },
        { pubkey: vaultAuthority, isSigner: false, isWritable: false },
        { pubkey: VAULT_TOKEN_ACCOUNT, isSigner: false, isWritable: true },
        { pubkey: playerAta, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data: withdrawData,
    }),
    [player],
    "withdrawn",
  );

  const finalBal = await tokenBalance(conn, playerAta);
  console.log(`\n✅ Smoke test complete`);
  console.log(`  ATA final balance: ${finalBal}`);
  console.log(`  Net change vs pre-faucet: +${finalBal - before}`);
}

main().catch((err) => {
  console.error("❌ Smoke test failed:", err);
  process.exit(1);
});
