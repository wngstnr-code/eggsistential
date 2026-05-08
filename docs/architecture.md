# Architecture

## High-Level System

```text
Wallet -> Frontend -> Backend + Socket Gateway
                      |                  |
                      v                  v
                   Supabase        Solana Program
```

## Why The Architecture Is Split

EGGSISTENTIAL needs to balance three things:

- responsive gameplay
- verifiable value flow
- reusable reputation state

That is why the product does not put every action on-chain.

## Frontend

The frontend provides:

- wallet-native onboarding
- game interface
- vault experience
- Passport-facing product UI

## Backend

The backend provides:

- auth and session handling
- realtime game authority
- settlement signing and relay
- API access for player and Passport data

## Solana Program

The on-chain layer provides:

- vault and balance state
- session state
- Passport state
- publicly verifiable product state where it matters

## Supabase

Supabase supports:

- player records
- session history
- transaction history
- leaderboard-style queries

## Design Outcome

This split keeps the user experience fast while preserving a clear trust boundary:

- gameplay stays practical and responsive
- important state stays verifiable
- Passport stays reusable across the ecosystem
