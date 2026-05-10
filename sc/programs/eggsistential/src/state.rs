use anchor_lang::prelude::*;

use crate::constants::ZERO_SESSION_ID;

#[account]
#[derive(Debug, InitSpace)]

pub struct Config {
    pub admin: Pubkey,
    pub backend_signer: Pubkey,
    pub token_mint: Pubkey,
    pub vault_token_account: Pubkey,
    pub vault_authority_bump: u8,
    pub config_bump: u8,
    pub paused: bool,
    pub session_expiry_delay: i64,
    pub faucet_claim_amount: u64,
    pub treasury_balance: u64,
    pub total_available_balance: u64,
    pub total_locked_balance: u64,
}

#[account]
#[derive(Debug, InitSpace)]

pub struct PlayerBalance {
    pub owner: Pubkey,
    pub available_balance: u64,
    pub locked_balance: u64,
    pub active_session: [u8; 32],
    pub bump: u8,
}

impl PlayerBalance {
    pub fn has_active_session(&self) -> bool {
        self.active_session != ZERO_SESSION_ID
    }
}

#[account]
#[derive(Debug, InitSpace)]

pub struct Session {
    pub session_id: [u8; 32],
    pub player: Pubkey,
    pub stake_amount: u64,
    pub started_at: i64,
    pub active: bool,
    pub settled: bool,
    pub bump: u8,
}

#[account]
#[derive(Debug, InitSpace)]

pub struct EggPass {
    pub player: Pubkey,
    pub tier: u8,
    pub highest_checkpoint: u8,
    pub cp2_cashouts: u16,
    pub cp4_cashouts: u16,
    pub cp6_cashouts: u16,
    pub cp8_cashouts: u16,
    pub reputation_score: u16,
    pub issued_at: i64,
    pub expiry: i64,
    pub revoked: bool,
    pub bump: u8,
}

#[account]
#[derive(Debug, InitSpace)]

pub struct UsedNonce {
    pub nonce: [u8; 32],
    pub bump: u8,
}
