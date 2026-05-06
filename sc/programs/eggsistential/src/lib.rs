//! Eggsistential Solana program built with Anchor.
//!
//! This program manages faucet claims, vault accounting,
//! backend-approved settlements, and EggPass credentials.

use anchor_lang::prelude::*;

pub mod constants;
pub mod error;
pub mod events;
pub mod instructions;
pub mod state;

use instructions::{
    AdminOnly, ClaimEggPass, ClaimFaucet, Deposit, ExpireSession, InitializeConfig,
    InitializeConfigParams, EggPassClaimParams, RevokeEggPass, SettleSession,
    SettleSessionParams, StartSession, StartSessionParams, TreasuryWithdraw, Withdraw,
};

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkgMQhgM7ud1a");

#[program]
pub mod eggsistential {
    use super::*;

    pub fn initialize_config(ctx: Context<InitializeConfig>, params: InitializeConfigParams) -> Result<()> {
        instructions::initialize_config(ctx, params)
    }

    pub fn set_backend_signer(ctx: Context<AdminOnly>, backend_signer: Pubkey) -> Result<()> {
        instructions::set_backend_signer(ctx, backend_signer)
    }

    pub fn set_session_expiry_delay(ctx: Context<AdminOnly>, session_expiry_delay: i64) -> Result<()> {
        instructions::set_session_expiry_delay(ctx, session_expiry_delay)
    }

    pub fn set_faucet_claim_amount(ctx: Context<AdminOnly>, amount: u64) -> Result<()> {
        instructions::set_faucet_claim_amount(ctx, amount)
    }

    pub fn set_paused(ctx: Context<AdminOnly>, paused: bool) -> Result<()> {
        instructions::set_paused(ctx, paused)
    }

    pub fn claim_faucet(ctx: Context<ClaimFaucet>) -> Result<()> {
        instructions::claim_faucet(ctx)
    }

    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        instructions::deposit(ctx, amount)
    }

    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        instructions::withdraw(ctx, amount)
    }

    pub fn fund_treasury(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        instructions::fund_treasury(ctx, amount)
    }

    pub fn treasury_withdraw(ctx: Context<TreasuryWithdraw>, amount: u64) -> Result<()> {
        instructions::treasury_withdraw(ctx, amount)
    }

    pub fn start_session(ctx: Context<StartSession>, params: StartSessionParams) -> Result<()> {
        instructions::start_session(ctx, params)
    }

    pub fn settle_session(ctx: Context<SettleSession>, params: SettleSessionParams) -> Result<()> {
        instructions::settle_session(ctx, params)
    }

    pub fn expire_session(ctx: Context<ExpireSession>, session_id: [u8; 32]) -> Result<()> {
        instructions::expire_session(ctx, session_id)
    }

    pub fn claim_egg_pass(ctx: Context<ClaimEggPass>, params: EggPassClaimParams) -> Result<()> {
        instructions::claim_egg_pass(ctx, params)
    }

    pub fn revoke_egg_pass(ctx: Context<RevokeEggPass>) -> Result<()> {
        instructions::revoke_egg_pass(ctx)
    }
}
