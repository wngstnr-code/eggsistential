# Deployment

## Local Defaults

Current defaults in the repository:

- frontend: `http://localhost:3000`
- backend: `http://localhost:8000`
- Solana cluster: `devnet`

## Main Workspaces

```text
frontend/   user-facing app
backend/    auth, gameplay authority, APIs, settlement
sc/         Solana program and scripts
```

## Main Commands

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Backend

```bash
cd backend
npm install
npm run dev
```

### Onchain

```bash
cd sc
NO_DNA=1 anchor build --no-idl
cargo test --manifest-path programs/eggsistential/Cargo.toml
```

## Deployment Notes

The repository is currently structured so the frontend, backend, and onchain system can be developed independently while still working as one product.

For production deployment, the most important requirement is keeping wallet flow, backend configuration, and Solana program configuration aligned.
