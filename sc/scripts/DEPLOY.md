# Deploy ke Devnet

## Prasyarat

- `solana-cli` 3.x dan `anchor-cli` 0.30.1 sudah ter-install
- Wallet di `~/.config/solana/id.json` (kalau import dari Phantom: `pnpm run import-wallet`)
- Node 20+

## Step 1 — Set CLI ke devnet & airdrop

```bash
solana config set --url https://api.devnet.solana.com
solana airdrop 2
solana balance
```

Kalau airdrop rate-limited, pakai faucet web: https://faucet.solana.com

## Step 2 — Build & deploy program

```bash
# dari root sc/
anchor build
anchor deploy --provider.cluster devnet
```

Program ID sudah hardcoded ke `8cfSNA3TQjzWazzU9D7UEMSs8NeT27D35fkxPmonMyzd`.
Kalau pertama kali deploy dan program ID belum cocok dengan keypair di
`target/deploy/eggsistential-keypair.json`, jalankan:

```bash
anchor keys sync
anchor build
```

## Step 3 — Initialize config

```bash
cd scripts
npm install   # atau pnpm/bun install

# variabel opsional (default: backend = admin, faucet = 1000 token, expiry = 24h)
export BACKEND_SIGNER=<pubkey-backend>      # opsional
export FAUCET_CLAIM_AMOUNT=1000000000        # opsional, dalam unit terkecil (6 desimal)
export SESSION_EXPIRY_DELAY=86400            # opsional, dalam detik

npm run init-config
```

Output akan kasih:
- `config` PDA
- `tokenMint` (SPL mint baru, mint authority = vault_authority PDA)
- `vaultTokenAccount` (ATA milik vault_authority)

Simpan ketiganya — backend & frontend butuh ini.

## Step 4 — Smoke test

Kalau mau cepat tes faucet jalan:

```bash
# panggil claim_faucet via anchor client atau CLI custom
# vault_authority akan mint token baru ke ATA player
```

## Troubleshoot

| Error | Penyebab |
|---|---|
| `account already in use` saat init | Config sudah pernah di-initialize. Skrip akan skip otomatis. |
| `mint authority mismatch` | Mint dibuat manual tanpa set authority ke `vault_authority` PDA. Pakai skrip ini, jangan buat mint manual. |
| `insufficient funds for rent` | Wallet kehabisan SOL devnet. Airdrop ulang. |
| `Program failed to complete: BPF program panicked` | Cek log: `solana logs <PROGRAM_ID>`. |
