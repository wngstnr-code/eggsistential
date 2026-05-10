# Eggsistential Backend

The Eggsistential backend powers the server-authoritative game flow and authentication.

Main responsibilities:

- **SIWS Authentication**: Sign-In With Solana for secure wallet sessions.
- **Social Login**: Easy onboarding for non-crypto users via Reown AppKit.
- **Real-time Gameplay**: Low-latency game state synchronization over Socket.io.
- **Secure Settlements**: Signs and relays game outcomes to the Solana blockchain.
- **Player APIs**: Manages leaderboards, player profiles, and on-chain trust signatures.

## Stack

- **Express**: Web framework.
- **Socket.io**: Real-time communication.
- **Solana Web3.js**: Blockchain interaction.
- **Supabase**: Database and storage.

## Commands

```bash
npm install
npm run dev
npm run build
npm run start
```

## Runtime

Default local setup:

- Backend URL: `http://localhost:8000`
- Expected frontend origin: `http://localhost:3000`

## Required Environment

The backend reads values from `backend/.env`.

```bash
PORT=8000
FRONTEND_URL=http://localhost:3000
SESSION_SECRET=your_session_secret
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_key

# Solana Config
NETWORK_NAME=solana-devnet
RPC_URL=https://api.devnet.solana.com
SOLANA_CLUSTER=devnet

# Contract Addresses
PROGRAM_ID=
TOKEN_MINT=
VAULT_TOKEN_ACCOUNT=
BACKEND_PRIVATE_KEY=
SOCIAL_AUTH_ENABLED=true
```

## Database

The project uses Supabase for storing player history and session states.
The schema is defined in [database/schema.sql](./database/schema.sql).
