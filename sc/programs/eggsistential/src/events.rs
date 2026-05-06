use anchor_lang::prelude::*;

#[event]
pub struct ConfigInitialized {
    pub admin: Pubkey,
    pub backend_signer: Pubkey,
    pub token_mint: Pubkey,
    pub vault_token_account: Pubkey,
}

#[event]
pub struct BackendSignerUpdated {
    pub backend_signer: Pubkey,
}

#[event]
pub struct SessionExpiryDelayUpdated {
    pub delay: i64,
}

#[event]
pub struct FaucetClaimAmountUpdated {
    pub amount: u64,
}

#[event]
pub struct PauseUpdated {
    pub paused: bool,
}

#[event]
pub struct Deposited {
    pub player: Pubkey,
    pub amount: u64,
}

#[event]
pub struct Withdrawn {
    pub player: Pubkey,
    pub amount: u64,
}

#[event]
pub struct TreasuryFunded {
    pub funder: Pubkey,
    pub amount: u64,
}

#[event]
pub struct TreasuryWithdrawn {
    pub recipient: Pubkey,
    pub amount: u64,
}

#[event]
pub struct FaucetClaimed {
    pub player: Pubkey,
    pub amount: u64,
}

#[event]
pub struct SessionStarted {
    pub player: Pubkey,
    pub session_id: [u8; 32],
    pub stake_amount: u64,
}

#[event]
pub struct SessionSettled {
    pub player: Pubkey,
    pub session_id: [u8; 32],
    pub outcome: u8,
    pub stake_amount: u64,
    pub payout_amount: u64,
    pub final_multiplier_bp: u64,
}

#[event]
pub struct SessionExpired {
    pub player: Pubkey,
    pub session_id: [u8; 32],
    pub stake_amount: u64,
}

#[event]
pub struct EggPassClaimed {
    pub player: Pubkey,
    pub tier: u8,
    pub issued_at: i64,
    pub expiry: i64,
    pub nonce: [u8; 32],
}

#[event]
pub struct EggPassRevoked {
    pub player: Pubkey,
}
