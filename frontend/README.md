# EGGSISTENTIAL Frontend

The EGGSISTENTIAL frontend is a Next.js application for the Solana hackathon build.

Current frontend responsibilities:

- Solana wallet connection through Reown AppKit with the Solana adapter
- backend session bootstrap with the connected Solana public key
- gameplay UI and Socket.io bridge
- manage-money UX shell while Solana deposit/withdraw endpoints are being wired
- trust passport UX shell

## Live Deployment

- App: https://pass-chick.vercel.app/

## Stack

- Next.js
- React
- Reown AppKit + Solana adapter
- Socket.io client

The frontend uses Reown AppKit only for Solana wallet UX. Wagmi, Viem, and EVM wallet adapters are not part of the frontend flow.

## Commands

```bash
npm install
npm run dev
npm run build
npm run start
```

On Windows PowerShell, use `npm.cmd` if `npm.ps1` is blocked by execution policy.

## Required Environment

```bash
NEXT_PUBLIC_REOWN_PROJECT_ID=
NEXT_PUBLIC_SOLANA_CLUSTER=testnet
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.testnet.solana.com

NEXT_PUBLIC_USDC_MINT=
NEXT_PUBLIC_GAME_PROGRAM_ID=
NEXT_PUBLIC_VAULT_ADDRESS=
NEXT_PUBLIC_GAME_SETTLEMENT_ADDRESS=
NEXT_PUBLIC_TRUST_PASSPORT_PROGRAM_ID=
NEXT_PUBLIC_FAUCET_PROGRAM_ID=

NEXT_PUBLIC_DEPOSIT_DATA_SOURCE=backend
NEXT_PUBLIC_BACKEND_API_URL=http://localhost:8000
```

## Current Local Defaults

- frontend app: `http://localhost:3000`
- backend API: `http://localhost:8000`
- Solana cluster: `testnet`

## Migration Status

Done:

- Solana wallet connect uses Reown AppKit with `@reown/appkit-adapter-solana`.
- UI/environment copy now targets Solana.
- manage-money is switched to backend mode.
- EVM wallet providers, contract helpers, and onchain deposit hooks have been removed from the frontend source.

Still to migrate:

- SPL token balance reads
- Solana deposit and withdraw transaction flow
- game start transaction flow
- settlement/passport program interaction

## Common Issues

### Wallet connection fails

Check:

- `NEXT_PUBLIC_REOWN_PROJECT_ID` is set
- the Reown project domain matches the current app origin
- Phantom, Solflare, or another Solana wallet supported by Reown is available
- the selected wallet is unlocked
- the frontend was restarted after `.env` changes

### Backend auth fails

Check:

- the backend is running on `http://localhost:8000`
- `NEXT_PUBLIC_BACKEND_API_URL` matches the actual backend URL
- `FRONTEND_URL` in the backend matches the frontend origin
- the backend accepts the connected Solana public key format

## Build

```bash
npm run build
```
