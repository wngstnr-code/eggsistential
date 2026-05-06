use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, MintTo, Token, TokenAccount, Transfer};

use crate::constants::{
    BASIS_POINTS_SCALE, DEFAULT_SESSION_EXPIRY_DELAY, OUTCOME_CASHED_OUT, OUTCOME_CRASHED,
    ZERO_SESSION_ID,
};
use crate::error::EggsError;
use crate::events::{
    BackendSignerUpdated, ConfigInitialized, Deposited, FaucetClaimAmountUpdated, FaucetClaimed,
    EggPassClaimed, EggPassRevoked, PauseUpdated, SessionExpired, SessionExpiryDelayUpdated,
    SessionSettled, SessionStarted, TreasuryFunded, TreasuryWithdrawn, Withdrawn,
};
use crate::state::{Config, EggPass, PlayerBalance, Session, UsedNonce};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub struct InitializeConfigParams {
    pub backend_signer: Pubkey,
    pub faucet_claim_amount: u64,
    pub session_expiry_delay: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub struct StartSessionParams {
    pub session_id: [u8; 32],
    pub stake_amount: u64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub struct SettleSessionParams {
    pub session_id: [u8; 32],
    pub player: Pubkey,
    pub stake_amount: u64,
    pub payout_amount: u64,
    pub final_multiplier_bp: u64,
    pub outcome: u8,
    pub deadline: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub struct EggPassClaimParams {
    pub tier: u8,
    pub issued_at: i64,
    pub expiry: i64,
    pub nonce: [u8; 32],
}

pub fn initialize_config(ctx: Context<InitializeConfig>, params: InitializeConfigParams) -> Result<()> {
    require!(params.faucet_claim_amount > 0, EggsError::InvalidClaimAmount);
    require!(params.backend_signer != Pubkey::default(), EggsError::InvalidBackendSigner);

    let expiry_delay = normalize_expiry_delay(params.session_expiry_delay)?;
    let config = &mut ctx.accounts.config;

    config.admin = ctx.accounts.admin.key();
    config.backend_signer = params.backend_signer;
    config.token_mint = ctx.accounts.token_mint.key();
    config.vault_token_account = ctx.accounts.vault_token_account.key();
    config.vault_authority_bump = ctx.bumps.vault_authority;
    config.config_bump = ctx.bumps.config;
    config.paused = false;
    config.session_expiry_delay = expiry_delay;
    config.faucet_claim_amount = params.faucet_claim_amount;
    config.treasury_balance = 0;
    config.total_available_balance = 0;
    config.total_locked_balance = 0;

    emit!(ConfigInitialized {
        admin: config.admin,
        backend_signer: config.backend_signer,
        token_mint: config.token_mint,
        vault_token_account: config.vault_token_account,
    });

    Ok(())
}

pub fn set_backend_signer(ctx: Context<AdminOnly>, backend_signer: Pubkey) -> Result<()> {
    require!(backend_signer != Pubkey::default(), EggsError::InvalidBackendSigner);
    let config = &mut ctx.accounts.config;
    config.backend_signer = backend_signer;

    emit!(BackendSignerUpdated { backend_signer });
    Ok(())
}

pub fn set_session_expiry_delay(ctx: Context<AdminOnly>, session_expiry_delay: i64) -> Result<()> {
    let delay = normalize_expiry_delay(session_expiry_delay)?;
    let config = &mut ctx.accounts.config;
    config.session_expiry_delay = delay;

    emit!(SessionExpiryDelayUpdated { delay });
    Ok(())
}

pub fn set_faucet_claim_amount(ctx: Context<AdminOnly>, amount: u64) -> Result<()> {
    require!(amount > 0, EggsError::InvalidClaimAmount);

    let config = &mut ctx.accounts.config;
    config.faucet_claim_amount = amount;

    emit!(FaucetClaimAmountUpdated { amount });
    Ok(())
}

pub fn set_paused(ctx: Context<AdminOnly>, paused: bool) -> Result<()> {
    let config = &mut ctx.accounts.config;
    config.paused = paused;

    emit!(PauseUpdated { paused });
    Ok(())
}

pub fn claim_faucet(ctx: Context<ClaimFaucet>) -> Result<()> {
    let config = &ctx.accounts.config;
    require_not_paused(config)?;

    let claim_amount = config.faucet_claim_amount;
    require!(claim_amount > 0, EggsError::InvalidClaimAmount);

    let vault_authority_bump = [config.vault_authority_bump];
    let signer_seeds: &[&[u8]] = &[b"vault-authority", &vault_authority_bump];
    let signer = &[signer_seeds];

    token::mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            MintTo {
                mint: ctx.accounts.token_mint.to_account_info(),
                to: ctx.accounts.player_token_account.to_account_info(),
                authority: ctx.accounts.vault_authority.to_account_info(),
            },
            signer,
        ),
        claim_amount,
    )?;

    emit!(FaucetClaimed {
        player: ctx.accounts.player.key(),
        amount: claim_amount,
    });

    Ok(())
}

pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
    require!(amount > 0, EggsError::ZeroAmount);
    require_not_paused(&ctx.accounts.config)?;

    let player_key = ctx.accounts.player.key();
    initialize_or_validate_player_balance(
        &mut ctx.accounts.player_balance,
        player_key,
        ctx.bumps.player_balance,
    )?;

    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.player_token_account.to_account_info(),
                to: ctx.accounts.vault_token_account.to_account_info(),
                authority: ctx.accounts.player.to_account_info(),
            },
        ),
        amount,
    )?;

    ctx.accounts.player_balance.available_balance =
        checked_add(ctx.accounts.player_balance.available_balance, amount)?;
    ctx.accounts.config.total_available_balance =
        checked_add(ctx.accounts.config.total_available_balance, amount)?;

    emit!(Deposited {
        player: player_key,
        amount,
    });

    Ok(())
}

pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
    require!(amount > 0, EggsError::ZeroAmount);

    let player_key = ctx.accounts.player.key();
    initialize_or_validate_player_balance(
        &mut ctx.accounts.player_balance,
        player_key,
        ctx.accounts.player_balance.bump,
    )?;
    require!(
        ctx.accounts.player_balance.available_balance >= amount,
        EggsError::InsufficientAvailableBalance
    );

    ctx.accounts.player_balance.available_balance =
        checked_sub(ctx.accounts.player_balance.available_balance, amount)?;
    ctx.accounts.config.total_available_balance =
        checked_sub(ctx.accounts.config.total_available_balance, amount)?;

    let vault_authority_bump = [ctx.accounts.config.vault_authority_bump];
    let signer_seeds: &[&[u8]] = &[b"vault-authority", &vault_authority_bump];
    let signer = &[signer_seeds];

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.vault_token_account.to_account_info(),
                to: ctx.accounts.player_token_account.to_account_info(),
                authority: ctx.accounts.vault_authority.to_account_info(),
            },
            signer,
        ),
        amount,
    )?;

    emit!(Withdrawn {
        player: player_key,
        amount,
    });

    Ok(())
}

pub fn fund_treasury(ctx: Context<Deposit>, amount: u64) -> Result<()> {
    require!(amount > 0, EggsError::ZeroAmount);
    require_not_paused(&ctx.accounts.config)?;

    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.player_token_account.to_account_info(),
                to: ctx.accounts.vault_token_account.to_account_info(),
                authority: ctx.accounts.player.to_account_info(),
            },
        ),
        amount,
    )?;

    ctx.accounts.config.treasury_balance = checked_add(ctx.accounts.config.treasury_balance, amount)?;

    emit!(TreasuryFunded {
        funder: ctx.accounts.player.key(),
        amount,
    });

    Ok(())
}

pub fn treasury_withdraw(ctx: Context<TreasuryWithdraw>, amount: u64) -> Result<()> {
    require!(amount > 0, EggsError::ZeroAmount);
    require!(ctx.accounts.config.treasury_balance >= amount, EggsError::InsufficientTreasury);

    ctx.accounts.config.treasury_balance = checked_sub(ctx.accounts.config.treasury_balance, amount)?;

    let vault_authority_bump = [ctx.accounts.config.vault_authority_bump];
    let signer_seeds: &[&[u8]] = &[b"vault-authority", &vault_authority_bump];
    let signer = &[signer_seeds];

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.vault_token_account.to_account_info(),
                to: ctx.accounts.recipient_token_account.to_account_info(),
                authority: ctx.accounts.vault_authority.to_account_info(),
            },
            signer,
        ),
        amount,
    )?;

    emit!(TreasuryWithdrawn {
        recipient: ctx.accounts.recipient.key(),
        amount,
    });

    Ok(())
}

pub fn start_session(ctx: Context<StartSession>, params: StartSessionParams) -> Result<()> {
    require_not_paused(&ctx.accounts.config)?;
    require!(params.session_id != ZERO_SESSION_ID, EggsError::InvalidSessionId);
    require!(params.stake_amount > 0, EggsError::ZeroAmount);

    let player_key = ctx.accounts.player.key();
    let player_balance = &mut ctx.accounts.player_balance;
    initialize_or_validate_player_balance(player_balance, player_key, ctx.bumps.player_balance)?;

    require!(!player_balance.has_active_session(), EggsError::SessionAlreadyActive);
    require!(
        player_balance.available_balance >= params.stake_amount,
        EggsError::InsufficientAvailableBalance
    );

    player_balance.available_balance = checked_sub(player_balance.available_balance, params.stake_amount)?;
    player_balance.locked_balance = checked_add(player_balance.locked_balance, params.stake_amount)?;
    player_balance.active_session = params.session_id;

    ctx.accounts.config.total_available_balance =
        checked_sub(ctx.accounts.config.total_available_balance, params.stake_amount)?;
    ctx.accounts.config.total_locked_balance =
        checked_add(ctx.accounts.config.total_locked_balance, params.stake_amount)?;

    let session = &mut ctx.accounts.session;
    session.session_id = params.session_id;
    session.player = player_key;
    session.stake_amount = params.stake_amount;
    session.started_at = Clock::get()?.unix_timestamp;
    session.active = true;
    session.settled = false;
    session.bump = ctx.bumps.session;

    emit!(SessionStarted {
        player: player_key,
        session_id: params.session_id,
        stake_amount: params.stake_amount,
    });

    Ok(())
}

pub fn settle_session(ctx: Context<SettleSession>, params: SettleSessionParams) -> Result<()> {
    let config = &mut ctx.accounts.config;
    require_not_paused(config)?;
    require_keys_eq!(
        ctx.accounts.backend_signer.key(),
        config.backend_signer,
        EggsError::InvalidBackendSigner
    );

    let now = Clock::get()?.unix_timestamp;
    require!(now <= params.deadline, EggsError::ResolutionExpired);
    require!(
        params.outcome == OUTCOME_CASHED_OUT || params.outcome == OUTCOME_CRASHED,
        EggsError::InvalidOutcome
    );

    let session = &mut ctx.accounts.session;
    require!(session.session_id == params.session_id, EggsError::InvalidSessionId);
    require!(session.active, EggsError::SessionNotActive);
    require!(!session.settled, EggsError::SessionAlreadySettled);
    require_keys_eq!(session.player, params.player, EggsError::ResolutionPlayerMismatch);
    require!(session.stake_amount == params.stake_amount, EggsError::ResolutionStakeMismatch);

    if params.outcome == OUTCOME_CASHED_OUT {
        let expected_payout = calculate_cashout_payout(params.stake_amount, params.final_multiplier_bp)?;
        require!(expected_payout == params.payout_amount, EggsError::ResolutionPayoutMismatch);
    } else {
        require!(params.payout_amount == 0, EggsError::CrashResolutionMustHaveZeroPayout);
    }

    let player_balance = &mut ctx.accounts.player_balance;
    initialize_or_validate_player_balance(
        player_balance,
        params.player,
        ctx.accounts.player_balance.bump,
    )?;
    require!(player_balance.locked_balance >= params.stake_amount, EggsError::InsufficientLockedBalance);

    player_balance.locked_balance = checked_sub(player_balance.locked_balance, params.stake_amount)?;
    player_balance.active_session = ZERO_SESSION_ID;
    config.total_locked_balance = checked_sub(config.total_locked_balance, params.stake_amount)?;

    if params.outcome == OUTCOME_CASHED_OUT {
        apply_cashout(config, player_balance, params.stake_amount, params.payout_amount)?;
    } else {
        config.treasury_balance = checked_add(config.treasury_balance, params.stake_amount)?;
    }

    session.active = false;
    session.settled = true;

    emit!(SessionSettled {
        player: params.player,
        session_id: params.session_id,
        outcome: params.outcome,
        stake_amount: params.stake_amount,
        payout_amount: params.payout_amount,
        final_multiplier_bp: params.final_multiplier_bp,
    });

    Ok(())
}

pub fn expire_session(ctx: Context<ExpireSession>, session_id: [u8; 32]) -> Result<()> {
    let config = &mut ctx.accounts.config;
    require_not_paused(config)?;

    let session = &mut ctx.accounts.session;
    require!(session.session_id == session_id, EggsError::InvalidSessionId);
    require!(session.active, EggsError::SessionNotActive);
    require!(!session.settled, EggsError::SessionAlreadySettled);

    let expires_at = checked_add_i64(session.started_at, config.session_expiry_delay)?;
    let now = Clock::get()?.unix_timestamp;
    require!(now > expires_at, EggsError::SessionNotExpired);

    let player_balance = &mut ctx.accounts.player_balance;
    initialize_or_validate_player_balance(
        player_balance,
        session.player,
        ctx.accounts.player_balance.bump,
    )?;
    require!(
        player_balance.locked_balance >= session.stake_amount,
        EggsError::InsufficientLockedBalance
    );

    player_balance.locked_balance = checked_sub(player_balance.locked_balance, session.stake_amount)?;
    player_balance.active_session = ZERO_SESSION_ID;
    config.total_locked_balance = checked_sub(config.total_locked_balance, session.stake_amount)?;
    config.treasury_balance = checked_add(config.treasury_balance, session.stake_amount)?;

    session.active = false;
    session.settled = true;

    emit!(SessionExpired {
        player: session.player,
        session_id,
        stake_amount: session.stake_amount,
    });
    emit!(SessionSettled {
        player: session.player,
        session_id,
        outcome: OUTCOME_CRASHED,
        stake_amount: session.stake_amount,
        payout_amount: 0,
        final_multiplier_bp: 0,
    });

    Ok(())
}

pub fn claim_egg_pass(ctx: Context<ClaimEggPass>, params: EggPassClaimParams) -> Result<()> {
    require_keys_eq!(
        ctx.accounts.backend_signer.key(),
        ctx.accounts.config.backend_signer,
        EggsError::InvalidBackendSigner
    );
    require_not_paused(&ctx.accounts.config)?;
    require!(params.tier > 0, EggsError::InvalidEggPassTier);
    require!(params.issued_at > 0, EggsError::InvalidEggPassIssuedAt);
    require!(params.expiry > params.issued_at, EggsError::InvalidEggPassExpiry);

    let now = Clock::get()?.unix_timestamp;
    require!(now <= params.expiry, EggsError::EggPassClaimExpired);

    let player_key = ctx.accounts.player.key();
    let egg_pass = &mut ctx.accounts.egg_pass;

    if egg_pass.player == Pubkey::default() {
        egg_pass.player = player_key;
        egg_pass.bump = ctx.bumps.egg_pass;
    } else {
        require_keys_eq!(egg_pass.player, player_key, EggsError::InvalidPlayer);
    }

    if egg_pass.issued_at != 0 {
        require!(params.issued_at >= egg_pass.issued_at, EggsError::StaleEggPassClaim);
    }

    egg_pass.tier = params.tier;
    egg_pass.issued_at = params.issued_at;
    egg_pass.expiry = params.expiry;
    egg_pass.revoked = false;

    let used_nonce = &mut ctx.accounts.used_nonce;
    used_nonce.nonce = params.nonce;
    used_nonce.bump = ctx.bumps.used_nonce;

    emit!(EggPassClaimed {
        player: player_key,
        tier: params.tier,
        issued_at: params.issued_at,
        expiry: params.expiry,
        nonce: params.nonce,
    });

    Ok(())
}

pub fn revoke_egg_pass(ctx: Context<RevokeEggPass>) -> Result<()> {
    let egg_pass = &mut ctx.accounts.egg_pass;
    require!(!egg_pass.revoked, EggsError::EggPassAlreadyRevoked);
    egg_pass.revoked = true;

    emit!(EggPassRevoked {
        player: egg_pass.player,
    });
    Ok(())
}

fn require_not_paused(config: &Config) -> Result<()> {
    require!(!config.paused, EggsError::ProgramPaused);
    Ok(())
}

fn normalize_expiry_delay(session_expiry_delay: i64) -> Result<i64> {
    if session_expiry_delay == 0 {
        return Ok(DEFAULT_SESSION_EXPIRY_DELAY);
    }

    require!(session_expiry_delay > 0, EggsError::InvalidSessionExpiryDelay);
    Ok(session_expiry_delay)
}

fn initialize_or_validate_player_balance(
    player_balance: &mut Account<'_, PlayerBalance>,
    owner: Pubkey,
    bump: u8,
) -> Result<()> {
    if player_balance.owner == Pubkey::default() {
        player_balance.owner = owner;
        player_balance.available_balance = 0;
        player_balance.locked_balance = 0;
        player_balance.active_session = ZERO_SESSION_ID;
        player_balance.bump = bump;
        return Ok(());
    }

    require_keys_eq!(player_balance.owner, owner, EggsError::PlayerBalanceOwnerMismatch);
    Ok(())
}

fn apply_cashout(
    config: &mut Account<'_, Config>,
    player_balance: &mut Account<'_, PlayerBalance>,
    stake_amount: u64,
    payout_amount: u64,
) -> Result<()> {
    if payout_amount > stake_amount {
        let treasury_needed = checked_sub(payout_amount, stake_amount)?;
        require!(config.treasury_balance >= treasury_needed, EggsError::InsufficientTreasury);
        config.treasury_balance = checked_sub(config.treasury_balance, treasury_needed)?;
    } else if stake_amount > payout_amount {
        let retained_amount = checked_sub(stake_amount, payout_amount)?;
        config.treasury_balance = checked_add(config.treasury_balance, retained_amount)?;
    }

    player_balance.available_balance = checked_add(player_balance.available_balance, payout_amount)?;
    config.total_available_balance = checked_add(config.total_available_balance, payout_amount)?;
    Ok(())
}

fn checked_add(lhs: u64, rhs: u64) -> Result<u64> {
    lhs.checked_add(rhs).ok_or_else(|| error!(EggsError::ArithmeticOverflow))
}

fn checked_sub(lhs: u64, rhs: u64) -> Result<u64> {
    lhs.checked_sub(rhs).ok_or_else(|| error!(EggsError::ArithmeticOverflow))
}

fn checked_add_i64(lhs: i64, rhs: i64) -> Result<i64> {
    lhs.checked_add(rhs).ok_or_else(|| error!(EggsError::ArithmeticOverflow))
}

/// Calculates the payout amount for a cashout settlement using basis points.
pub fn calculate_cashout_payout(stake_amount: u64, final_multiplier_bp: u64) -> Result<u64> {
    let scaled = u128::from(stake_amount)
        .checked_mul(u128::from(final_multiplier_bp))
        .ok_or_else(|| error!(EggsError::ArithmeticOverflow))?;

    let payout = scaled
        .checked_div(u128::from(BASIS_POINTS_SCALE))
        .ok_or_else(|| error!(EggsError::ArithmeticOverflow))?;

    u64::try_from(payout).map_err(|_| error!(EggsError::ArithmeticOverflow))
}

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(
        init,
        payer = admin,
        space = 8 + Config::INIT_SPACE,
        seeds = [b"config"],
        bump
    )]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub token_mint: Account<'info, Mint>,
    /// CHECK: This PDA only signs CPIs for the program-owned token vault and faucet minting flow.
    #[account(seeds = [b"vault-authority"], bump)]
    pub vault_authority: UncheckedAccount<'info>,
    #[account(
        init,
        payer = admin,
        associated_token::mint = token_mint,
        associated_token::authority = vault_authority
    )]
    pub vault_token_account: Account<'info, TokenAccount>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct AdminOnly<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(
        mut,
        seeds = [b"config"],
        bump = config.config_bump,
        constraint = config.admin == admin.key() @ EggsError::UnauthorizedAdmin
    )]
    pub config: Account<'info, Config>,
}

#[derive(Accounts)]
pub struct ClaimFaucet<'info> {
    #[account(
        seeds = [b"config"],
        bump = config.config_bump,
        has_one = token_mint,
        constraint = config.vault_token_account == vault_token_account.key()
    )]
    pub config: Account<'info, Config>,
    pub token_mint: Account<'info, Mint>,
    /// CHECK: PDA signer for token minting and vault transfers.
    #[account(seeds = [b"vault-authority"], bump = config.vault_authority_bump)]
    pub vault_authority: UncheckedAccount<'info>,
    #[account(mut)]
    pub vault_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub player: Signer<'info>,
    #[account(
        mut,
        associated_token::mint = token_mint,
        associated_token::authority = player
    )]
    pub player_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(
        mut,
        seeds = [b"config"],
        bump = config.config_bump,
        has_one = token_mint,
        constraint = config.vault_token_account == vault_token_account.key()
    )]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub player: Signer<'info>,
    #[account(
        init_if_needed,
        payer = player,
        space = 8 + PlayerBalance::INIT_SPACE,
        seeds = [b"player-balance", player.key().as_ref()],
        bump
    )]
    pub player_balance: Account<'info, PlayerBalance>,
    pub token_mint: Account<'info, Mint>,
    #[account(
        mut,
        associated_token::mint = token_mint,
        associated_token::authority = player
    )]
    pub player_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub vault_token_account: Account<'info, TokenAccount>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(
        mut,
        seeds = [b"config"],
        bump = config.config_bump,
        has_one = token_mint,
        constraint = config.vault_token_account == vault_token_account.key()
    )]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub player: Signer<'info>,
    #[account(
        mut,
        seeds = [b"player-balance", player.key().as_ref()],
        bump = player_balance.bump
    )]
    pub player_balance: Account<'info, PlayerBalance>,
    pub token_mint: Account<'info, Mint>,
    /// CHECK: PDA signer for token transfers out of the vault.
    #[account(seeds = [b"vault-authority"], bump = config.vault_authority_bump)]
    pub vault_authority: UncheckedAccount<'info>,
    #[account(mut)]
    pub vault_token_account: Account<'info, TokenAccount>,
    #[account(
        mut,
        associated_token::mint = token_mint,
        associated_token::authority = player
    )]
    pub player_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct TreasuryWithdraw<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(
        mut,
        seeds = [b"config"],
        bump = config.config_bump,
        has_one = token_mint,
        constraint = config.admin == admin.key() @ EggsError::UnauthorizedAdmin,
        constraint = config.vault_token_account == vault_token_account.key()
    )]
    pub config: Account<'info, Config>,
    pub token_mint: Account<'info, Mint>,
    /// CHECK: PDA signer for token transfers out of the vault.
    #[account(seeds = [b"vault-authority"], bump = config.vault_authority_bump)]
    pub vault_authority: UncheckedAccount<'info>,
    #[account(mut)]
    pub vault_token_account: Account<'info, TokenAccount>,
    /// CHECK: The recipient only needs to match the associated token owner.
    pub recipient: UncheckedAccount<'info>,
    #[account(
        mut,
        associated_token::mint = token_mint,
        associated_token::authority = recipient
    )]
    pub recipient_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(params: StartSessionParams)]
pub struct StartSession<'info> {
    #[account(
        mut,
        seeds = [b"config"],
        bump = config.config_bump
    )]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub player: Signer<'info>,
    #[account(
        init_if_needed,
        payer = player,
        space = 8 + PlayerBalance::INIT_SPACE,
        seeds = [b"player-balance", player.key().as_ref()],
        bump
    )]
    pub player_balance: Account<'info, PlayerBalance>,
    #[account(
        init,
        payer = player,
        space = 8 + Session::INIT_SPACE,
        seeds = [b"session", params.session_id.as_ref()],
        bump
    )]
    pub session: Account<'info, Session>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SettleSession<'info> {
    #[account(
        mut,
        seeds = [b"config"],
        bump = config.config_bump
    )]
    pub config: Account<'info, Config>,
    pub backend_signer: Signer<'info>,
    #[account(
        mut,
        seeds = [b"player-balance", session.player.as_ref()],
        bump = player_balance.bump
    )]
    pub player_balance: Account<'info, PlayerBalance>,
    #[account(
        mut,
        seeds = [b"session", session.session_id.as_ref()],
        bump = session.bump
    )]
    pub session: Account<'info, Session>,
}

#[derive(Accounts)]
#[instruction(session_id: [u8; 32])]
pub struct ExpireSession<'info> {
    #[account(
        mut,
        seeds = [b"config"],
        bump = config.config_bump
    )]
    pub config: Account<'info, Config>,
    #[account(
        mut,
        seeds = [b"player-balance", session.player.as_ref()],
        bump = player_balance.bump
    )]
    pub player_balance: Account<'info, PlayerBalance>,
    #[account(
        mut,
        seeds = [b"session", session_id.as_ref()],
        bump = session.bump
    )]
    pub session: Account<'info, Session>,
}

#[derive(Accounts)]
#[instruction(params: EggPassClaimParams)]
pub struct ClaimEggPass<'info> {
    #[account(
        seeds = [b"config"],
        bump = config.config_bump
    )]
    pub config: Account<'info, Config>,
    pub backend_signer: Signer<'info>,
    #[account(mut)]
    pub player: Signer<'info>,
    #[account(
        init_if_needed,
        payer = player,
        space = 8 + EggPass::INIT_SPACE,
        seeds = [b"egg-pass", player.key().as_ref()],
        bump
    )]
    pub egg_pass: Account<'info, EggPass>,
    #[account(
        init,
        payer = player,
        space = 8 + UsedNonce::INIT_SPACE,
        seeds = [b"egg-pass-nonce", params.nonce.as_ref()],
        bump
    )]
    pub used_nonce: Account<'info, UsedNonce>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RevokeEggPass<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(
        seeds = [b"config"],
        bump = config.config_bump,
        constraint = config.admin == admin.key() @ EggsError::UnauthorizedAdmin
    )]
    pub config: Account<'info, Config>,
    #[account(
        mut,
        seeds = [b"egg-pass", egg_pass.player.as_ref()],
        bump = egg_pass.bump
    )]
    pub egg_pass: Account<'info, EggPass>,
}

#[cfg(test)]
mod tests {
    use super::calculate_cashout_payout;

    #[test]
    fn calculate_cashout_payout_should_return_expected_amount_for_basis_points() {
        let payout = calculate_cashout_payout(50_000_000, 12_000).unwrap();
        assert_eq!(payout, 60_000_000);
    }

    #[test]
    fn calculate_cashout_payout_should_allow_zero_multiplier() {
        let payout = calculate_cashout_payout(35_000_000, 0).unwrap();
        assert_eq!(payout, 0);
    }
}
