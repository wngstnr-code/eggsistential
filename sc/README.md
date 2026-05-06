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
- `EggPass`: trust tier, issue time, expiry, dan revoke status
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

## Commands

```bash
anchor build
cargo fmt --all --check
cargo test --manifest-path programs/eggsistential/Cargo.toml
```

Catatan: environment kerja saat perubahan ini dibuat belum memasang `rustc`, `cargo`, `anchor`, atau `solana`, jadi verifikasi build belum bisa dijalankan lokal di sini.
