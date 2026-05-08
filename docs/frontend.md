# Frontend

## Overview

The frontend lives in `frontend/` and is built with Next.js and React.

It is responsible for the player-facing experience:

- wallet connection
- gameplay UI
- vault UI
- Passport-facing product screens
- backend API communication
- realtime socket communication

## Main Responsibilities

### Wallet Experience

The frontend handles wallet-native onboarding and keeps the product centered around a Solana wallet from the first interaction.

### Gameplay Experience

The frontend renders the live game interface while consuming state from the backend socket gateway.

### Vault Experience

The frontend exposes deposit, withdraw, and playable balance management.

### Product Presentation

The frontend is also where the player sees progression, session state, and Passport-facing status.

## Stack

- Next.js
- React
- Reown AppKit
- Socket.io client

## Local Default

`http://localhost:3000`
