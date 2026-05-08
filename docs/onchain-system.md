# Onchain System

## Overview

The onchain layer lives in `sc/` and is built with Solana and Anchor.

It provides the verifiable state that matters most to the product:

- vault state
- player balances
- session state
- faucet-related state
- Passport-related state

## Why It Exists

The product does not put every realtime action on-chain. Instead, it keeps the fast gameplay loop off-chain while preserving the important value and reputation state on-chain.

This gives the system:

- better gameplay responsiveness
- verifiable balance and session state
- a reusable Passport layer

## What It Supports

### Vault

The vault system supports playable balance flow on Solana.

### Sessions

The session layer anchors important game session state to the chain.

### Passport

Passport is the on-chain reputation output of the product. It is intended to become a reusable behavior-based trust signal.

## Stack

- Solana
- Anchor
- SPL token flow
