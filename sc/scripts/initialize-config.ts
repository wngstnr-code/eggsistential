/**
 * Initializes the eggsistential program on devnet without depending on a generated IDL.
 *  1. Creates a new SPL token mint owned by the vault-authority PDA.
 *  2. Calls `initialize_config` via raw instruction encoding.
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
  createInitializeMint2Instruction,
  getAssociatedTokenAddressSync,
  getMinimumBalanceForRentExemptMint,
  MINT_SIZE,
} from "@solana/spl-token";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";

const PROGRAM_ID = new PublicKey("2cATotAz8hga1PfPHXpAeapd1WFMMnB9AgY4DNWjX62k");
const TOKEN_DECIMALS = 6;
const DEFAULT_FAUCET_CLAIM = 1_000n * 10n ** BigInt(TOKEN_DECIMALS);
const DEFAULT_SESSION_EXPIRY_DELAY = 86_400;

function anchorDiscriminator(name: string): Buffer {
  return createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
}

function encodeInitializeConfigParams(
  backendSigner: PublicKey,
  faucetClaimAmount: bigint,
  sessionExpiryDelay: bigint,
): Buffer {
  const buf = Buffer.alloc(32 + 8 + 8);
  backendSigner.toBuffer().copy(buf, 0);
  buf.writeBigUInt64LE(faucetClaimAmount, 32);
  buf.writeBigInt64LE(sessionExpiryDelay, 40);
  return buf;
}

function loadKeypair(path: string): Keypair {
  const expanded = path.startsWith("~") ? path.replace("~", homedir()) : path;
  const secret = JSON.parse(readFileSync(expanded, "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

async function main() {
  const rpcUrl =
    process.env.ANCHOR_PROVIDER_URL ?? "https://api.devnet.solana.com";
  const walletPath =
    process.env.ANCHOR_WALLET ?? `${homedir()}/.config/solana/id.json`;
  const connection = new Connection(rpcUrl, "confirmed");
  const admin = loadKeypair(walletPath);

  const backendSigner = process.env.BACKEND_SIGNER
    ? new PublicKey(process.env.BACKEND_SIGNER)
    : admin.publicKey;
  const faucetClaim = process.env.FAUCET_CLAIM_AMOUNT
    ? BigInt(process.env.FAUCET_CLAIM_AMOUNT)
    : DEFAULT_FAUCET_CLAIM;
  const sessionDelay = process.env.SESSION_EXPIRY_DELAY
    ? BigInt(process.env.SESSION_EXPIRY_DELAY)
    : BigInt(DEFAULT_SESSION_EXPIRY_DELAY);

  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    PROGRAM_ID,
  );
  const [vaultAuthority] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault-authority")],
    PROGRAM_ID,
  );

  const existing = await connection.getAccountInfo(configPda);
  if (existing) {
    console.log("Config already initialized at", configPda.toBase58());
    return;
  }

  // 1. Create mint with vault_authority as mint authority
  const mintKp = Keypair.generate();
  const mintRent = await getMinimumBalanceForRentExemptMint(connection);
  const vaultAta = getAssociatedTokenAddressSync(
    mintKp.publicKey,
    vaultAuthority,
    true,
  );

  console.log("Creating mint:", mintKp.publicKey.toBase58());
  const mintTx = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: admin.publicKey,
      newAccountPubkey: mintKp.publicKey,
      space: MINT_SIZE,
      lamports: mintRent,
      programId: TOKEN_PROGRAM_ID,
    }),
    createInitializeMint2Instruction(
      mintKp.publicKey,
      TOKEN_DECIMALS,
      vaultAuthority,
      null,
    ),
  );
  await sendAndConfirmTransaction(connection, mintTx, [admin, mintKp]);

  // 2. Build initialize_config instruction manually
  const discriminator = anchorDiscriminator("initialize_config");
  const params = encodeInitializeConfigParams(
    backendSigner,
    faucetClaim,
    sessionDelay,
  );
  const data = Buffer.concat([discriminator, params]);

  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: admin.publicKey, isSigner: true, isWritable: true },
      { pubkey: configPda, isSigner: false, isWritable: true },
      { pubkey: mintKp.publicKey, isSigner: false, isWritable: true },
      { pubkey: vaultAuthority, isSigner: false, isWritable: false },
      { pubkey: vaultAta, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ],
    data,
  });

  console.log("Calling initialize_config...");
  const sig = await sendAndConfirmTransaction(
    connection,
    new Transaction().add(ix),
    [admin],
  );

  console.log("\n✅ Initialized");
  console.log("Tx:", sig);
  console.log({
    programId: PROGRAM_ID.toBase58(),
    config: configPda.toBase58(),
    vaultAuthority: vaultAuthority.toBase58(),
    tokenMint: mintKp.publicKey.toBase58(),
    vaultTokenAccount: vaultAta.toBase58(),
    admin: admin.publicKey.toBase58(),
    backendSigner: backendSigner.toBase58(),
    faucetClaimAmount: faucetClaim.toString(),
    sessionExpiryDelay: sessionDelay.toString(),
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
