# Backend

## Overview

The backend lives in `backend/` and acts as the system authority for gameplay and product state coordination.

It is responsible for:

- auth and session management
- realtime game authority
- settlement orchestration
- player and leaderboard APIs
- Passport-related APIs

## Main Responsibilities

### Authentication

The backend manages wallet-linked sessions and authenticated access to product features.

### Realtime Gameplay

The backend runs the authoritative live game loop and validates important session behavior.

### Settlement

The backend signs and relays the settlement path that connects gameplay outcomes to Solana-backed state.

### Product APIs

The backend exposes the endpoints that power player state, vault-related flows, leaderboards, and Passport data.

## Stack

- Express
- Socket.io
- Supabase
- Solana Web3

## Local Default

`http://localhost:8000`
