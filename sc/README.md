# Eggsistential Solana Program

The core logic of Eggsistential is implemented as a Solana smart contract using the Anchor framework.

## Architecture

- **`programs/eggsistential/src/lib.rs`**: Main program entry point.
- **`instructions.rs`**: Implementation of game logic (Deposit, Start, Settle, etc.).
- **`state.rs`**: Definitions for on-chain accounts (PlayerBalance, Session, EggPass).
- **`constants.rs`**: Program-wide settings and seeds.

## Key On-Chain Concepts

- **Vault Authority**: A Program Derived Address (PDA) that holds and manages all deposited assets securely.
- **EggPass**: An on-chain reputation system that tracks your skill tier based on successful checkpoint cashouts.
- **Session-Based Gameplay**: Every run is backed by an on-chain session to ensure transparency and prevent double-spending.

## Commands

### Development

```bash
# Build the program
anchor build --no-idl

# Run unit tests
cargo test --manifest-path programs/eggsistential/Cargo.toml
```

### Deployment

```bash
# Deploy to Devnet
anchor deploy --provider.cluster devnet
```

*Note: Use `--no-idl` if you encounter IDL generation issues with Anchor 0.30.1.*
