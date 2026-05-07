# Eggsistential Solana Program

`sc` adalah workspace Solana/Anchor untuk game flow backend-authoritative Eggsistential.

## Layout

- `Anchor.toml`
- `Cargo.toml`
- `programs/eggsistential/`

Source utama ada di:

- `programs/eggsistential/src/lib.rs`
- `programs/eggsistential/src/instructions.rs`
- `programs/eggsistential/src/state.rs`
- `programs/eggsistential/src/error.rs`
- `programs/eggsistential/src/events.rs`

## Accounts

- `Config`: admin, backend signer, mint, pause flag, expiry delay, faucet amount, dan aggregate balances
- `PlayerBalance`: saldo `available`, `locked`, dan satu `active_session`
- `Session`: state satu ronde game untuk `session_id`
- `EggPass`: trust tier, checkpoint cashout evidence, reputation score, issue time, expiry, dan revoke status
- `UsedNonce`: replay protection untuk claim `EggPass`

## Instructions

- `initialize_config`
- `set_backend_signer`
- `set_session_expiry_delay`
- `set_faucet_claim_amount`
- `set_paused`
- `claim_faucet`
- `deposit`
- `withdraw`
- `fund_treasury`
- `treasury_withdraw`
- `start_session`
- `settle_session`
- `expire_session`
- `claim_egg_pass`
- `revoke_egg_pass`

## Integration Notes

- SPL mint authority harus dipegang PDA `vault-authority` agar faucet bisa `mint_to`
- dana program disimpan di vault ATA milik PDA
- settlement dan `EggPass` claim membutuhkan `backend_signer` sebagai signer transaksi
- `session_id` dan `nonce` disimpan sebagai `[u8; 32]` agar PDA seed stabil
- `EggPass` tier mengikuti disciplined checkpoint cashout model:
  - Tier 1: minimal 3 cashout di checkpoint 2
  - Tier 2: minimal 4 cashout di checkpoint 4
  - Tier 3: minimal 4 cashout di checkpoint 6
  - Tier 4: minimal 3 cashout di checkpoint 8
- `EggPass` account menyimpan `highest_checkpoint`, per-checkpoint cashout counts, dan `reputation_score` agar partner apps dapat membaca bukti reputasi ringkas langsung dari account data.

## Commands

```bash
cargo fmt --all --check
NO_DNA=1 anchor build --no-idl
cargo test --manifest-path programs/eggsistential/Cargo.toml
```

Devnet deploy target:

```bash
anchor keys list
NO_DNA=1 anchor deploy --provider.cluster devnet
```

Catatan: full `anchor build` tanpa `--no-idl` masih dapat gagal di fase IDL generation pada Anchor `0.30.1`, sementara SBF program build dan unit test sudah terverifikasi.
