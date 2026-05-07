import { mkdirSync, writeFileSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import readline from "node:readline";

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const BASE58 = new Map([...ALPHABET].map((char, index) => [char, index]));
const OUTFILE = join(homedir(), ".config", "solana", "id.json");

function decodeBase58(value) {
  const input = value.trim();
  if (!input) {
    throw new Error("Private key kosong.");
  }

  const bytes = [0];
  for (const char of input) {
    const base58Value = BASE58.get(char);
    if (base58Value === undefined) {
      throw new Error(`Karakter base58 tidak valid: ${char}`);
    }

    let carry = base58Value;
    for (let index = 0; index < bytes.length; index += 1) {
      carry += bytes[index] * 58;
      bytes[index] = carry & 0xff;
      carry >>= 8;
    }

    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }

  for (const char of input) {
    if (char !== "1") break;
    bytes.push(0);
  }

  return bytes.reverse();
}

function askHidden(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });

  const originalWrite = process.stdout.write.bind(process.stdout);

  return new Promise((resolve) => {
    process.stdout.write = (chunk, encoding, callback) => {
      const text = String(chunk);
      if (text.includes(question)) {
        return originalWrite(chunk, encoding, callback);
      }
      if (typeof callback === "function") callback();
      return true;
    };

    rl.question(question, (answer) => {
      process.stdout.write = originalWrite;
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

const privateKey = await askHidden("Paste base58 private key devnet wallet: ");
const decoded = decodeBase58(privateKey);

if (decoded.length !== 64) {
  throw new Error(`Panjang keypair ${decoded.length} byte, harus 64 byte untuk Solana keypair.`);
}

mkdirSync(dirname(OUTFILE), { recursive: true });
writeFileSync(OUTFILE, JSON.stringify(decoded));
chmodSync(OUTFILE, 0o600);

console.log(`Saved keypair to ${OUTFILE}`);

const result = spawnSync("solana", ["address", "-k", OUTFILE], {
  encoding: "utf8",
});

if (result.status === 0) {
  console.log(`Wallet address: ${result.stdout.trim()}`);
} else {
  console.log("Keypair tersimpan, tapi `solana address` gagal dijalankan.");
}
