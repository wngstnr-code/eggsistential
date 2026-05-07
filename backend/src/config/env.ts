import "dotenv/config";

function requireEnv(key: string, fallback?: string): string {
  const value = process.env[key] ?? fallback;
  if (!value) {
    console.error(`❌ Missing required environment variable: ${key}`);
    console.error(`   → Copy .env.example to .env and fill in the values.`);
    process.exit(1);
  }
  return value;
}

function optionalEnv(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

const PROGRAM_ID = optionalEnv("PROGRAM_ID", optionalEnv("GAME_VAULT_ADDRESS", ""));

export const env = {
  PORT: parseInt(optionalEnv("PORT", "3001"), 10),
  FRONTEND_URL: optionalEnv("FRONTEND_URL", "http://localhost:3000"),
  NODE_ENV: optionalEnv("NODE_ENV", "development"),

  SESSION_SECRET: requireEnv("SESSION_SECRET", "dev-secret-change-me-in-production-please-32chars"),

  SUPABASE_URL: requireEnv("SUPABASE_URL", "https://placeholder.supabase.co"),
  SUPABASE_SERVICE_ROLE_KEY: requireEnv("SUPABASE_SERVICE_ROLE_KEY", "placeholder-key"),

  NETWORK_NAME: optionalEnv("NETWORK_NAME", "solana-devnet"),
  RPC_URL: optionalEnv("RPC_URL", "https://api.devnet.solana.com"),
  SOLANA_CLUSTER: optionalEnv("SOLANA_CLUSTER", "devnet"),
  CHAIN_ID: parseInt(optionalEnv("CHAIN_ID", "0"), 10),
  NATIVE_TOKEN_SYMBOL: optionalEnv("NATIVE_TOKEN_SYMBOL", "SOL"),
  MIN_RECOMMENDED_NATIVE_BALANCE: Number.parseFloat(optionalEnv("MIN_RECOMMENDED_NATIVE_BALANCE", "0.05")),

  PROGRAM_ID,
  CONFIG_PDA: optionalEnv("CONFIG_PDA", ""),
  VAULT_AUTHORITY_PDA: optionalEnv("VAULT_AUTHORITY_PDA", ""),
  TOKEN_MINT: optionalEnv("TOKEN_MINT", ""),
  VAULT_TOKEN_ACCOUNT: optionalEnv("VAULT_TOKEN_ACCOUNT", ""),
  TOKEN_DECIMALS: parseInt(optionalEnv("TOKEN_DECIMALS", "6"), 10),

  GAME_VAULT_ADDRESS: optionalEnv("GAME_VAULT_ADDRESS", PROGRAM_ID),
  GAME_SETTLEMENT_ADDRESS: optionalEnv("GAME_SETTLEMENT_ADDRESS", PROGRAM_ID),
  TRUST_PASSPORT_ADDRESS: optionalEnv("TRUST_PASSPORT_ADDRESS", PROGRAM_ID),
  FAUCET_CONTRACT_ADDRESS: optionalEnv("FAUCET_CONTRACT_ADDRESS", PROGRAM_ID),
  FAUCET_MODE: optionalEnv("FAUCET_MODE", "drip_to"),
  FAUCET_AMOUNT_UNITS: optionalEnv("FAUCET_AMOUNT_UNITS", "1000000000"),
  FAUCET_COOLDOWN_SECONDS: parseInt(optionalEnv("FAUCET_COOLDOWN_SECONDS", "300"), 10),

  BACKEND_PRIVATE_KEY: optionalEnv("BACKEND_PRIVATE_KEY", ""),
  ADMIN_PUBKEY: optionalEnv("ADMIN_PUBKEY", ""),
  BACKEND_SIGNER_PUBKEY: optionalEnv("BACKEND_SIGNER_PUBKEY", ""),

  SETTLEMENT_SIGNATURE_TTL_SECONDS: parseInt(optionalEnv("SETTLEMENT_SIGNATURE_TTL_SECONDS", "86400"), 10),
  PASSPORT_SIGNATURE_TTL_SECONDS: parseInt(optionalEnv("PASSPORT_SIGNATURE_TTL_SECONDS", "900"), 10),
  PASSPORT_VALIDITY_SECONDS: parseInt(optionalEnv("PASSPORT_VALIDITY_SECONDS", "2592000"), 10),

  MINIPAY_UNVERIFIED_AUTH_ENABLED:
    optionalEnv("MINIPAY_UNVERIFIED_AUTH_ENABLED", "true").toLowerCase() === "true",
} as const;

console.log(`🔧 Config loaded:`);
console.log(`   Port: ${env.PORT}`);
console.log(`   Frontend: ${env.FRONTEND_URL}`);
console.log(`   Supabase: ${env.SUPABASE_URL.replace(/https?:\/\//, "").substring(0, 20)}...`);
console.log(`   Network: ${env.NETWORK_NAME} (${env.SOLANA_CLUSTER})`);
console.log(`   RPC: ${env.RPC_URL}`);
console.log(`   Program: ${env.PROGRAM_ID || "(unset)"}`);
console.log(`   Token mint: ${env.TOKEN_MINT || "(unset)"}`);
console.log(`   Faucet: ${env.FAUCET_AMOUNT_UNITS} (${env.FAUCET_MODE})`);
