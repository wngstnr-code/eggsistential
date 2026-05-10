# EGGSISTENTIAL Frontend

The EGGSISTENTIAL frontend is a modern web application built with Next.js, serving as the interface for the high-stakes chicken-crossing game.

## Core Responsibilities

- **Wallet UX**: Seamless connection using Reown AppKit (supports Google, Social, and Solana Wallets).
- **Game Engine**: Interactive, high-performance canvas-based gameplay.
- **On-Chain Dashboard**: Manage vault balances, claim faucets, and track your EggPass reputation.
- **Backend Bridge**: Real-time communication with the game engine via Socket.io.

## Stack

- **Next.js**: Framework for the web app.
- **React**: Component library.
- **Three.js**: 3D engine for high-performance gameplay.
- **Reown AppKit**: Multi-wallet and social login solution.
- **Socket.io Client**: Real-time bridge.
- **Tailwind CSS**: Modern styling.

## Commands

```bash
npm install
npm run dev
npm run build
npm run start
```

## Required Environment

```bash
NEXT_PUBLIC_REOWN_PROJECT_ID=
NEXT_PUBLIC_SOLANA_CLUSTER=devnet
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com

NEXT_PUBLIC_USDC_MINT=
NEXT_PUBLIC_VAULT_ADDRESS=
NEXT_PUBLIC_BACKEND_API_URL=http://localhost:8000
```

## Build

```bash
npm run build
```
