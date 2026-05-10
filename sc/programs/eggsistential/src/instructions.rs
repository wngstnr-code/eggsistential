use anchor_lang::prelude::*;
use anchor_lang::solana_program::program_option::COption;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, MintTo, Token, TokenAccount, Transfer};

use crate::constants::{
    BASIS_POINTS_SCALE, DEFAULT_SESSION_EXPIRY_DELAY, OUTCOME_CASHED_OUT, OUTCOME_CRASHED,
    ZERO_SESSION_ID,
};
use crate::error::EggsError;
use crate::events::{
    BackendSignerUpdated, ConfigInitialized, Deposited, EggPassClaimed, EggPassRevoked,
    FaucetClaimAmountUpdated, FaucetClaimed, PauseUpdated, SessionExpired,
    SessionExpiryDelayUpdated, SessionSettled, SessionStarted, TreasuryFunded, TreasuryWithdrawn,
    Withdrawn,
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
    pub highest_checkpoint: u8,
    pub cp2_cashouts: u16,
    pub cp4_cashouts: u16,
    pub cp6_cashouts: u16,
    pub cp8_cashouts: u16,
    pub reputation_score: u16,
    pub issued_at: i64,
    pub expiry: i64,
    pub nonce: [u8; 32],
}

pub fn initialize_config(
    ctx: Context<InitializeConfig>,
    params: InitializeConfigParams,
) -> Result<()> {
    require!(
        params.faucet_claim_amount > 0,
        EggsError::InvalidClaimAmount
    );
    require!(
        params.backend_signer != Pubkey::default(),
        EggsError::InvalidBackendSigner
    );
    require_mint_authority(
        &ctx.accounts.token_mint.mint_authority,
        ctx.accounts.vault_authority.key(),
    )?;

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
    require!(
        backend_signer != Pubkey::default(),
        EggsError::InvalidBackendSigner
    );
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
    require_mint_authority(
        &ctx.accounts.token_mint.mint_authority,
        ctx.accounts.vault_authority.key(),
    )?;

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
    let player_balance_bump = ctx.accounts.player_balance.bump;
    initialize_or_validate_player_balance(
        &mut ctx.accounts.player_balance,
        player_key,
        player_balance_bump,
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

    ctx.accounts.config.treasury_balance =
        checked_add(ctx.accounts.config.treasury_balance, amount)?;

    emit!(TreasuryFunded {
        funder: ctx.accounts.player.key(),
        amount,
    });

    Ok(())
}

pub fn treasury_withdraw(ctx: Context<TreasuryWithdraw>, amount: u64) -> Result<()> {
    require!(amount > 0, EggsError::ZeroAmount);
    require!(
        ctx.accounts.config.treasury_balance >= amount,
        EggsError::InsufficientTreasury
    );

    ctx.accounts.config.treasury_balance =
        checked_sub(ctx.accounts.config.treasury_balance, amount)?;

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
    require!(
        params.session_id != ZERO_SESSION_ID,
        EggsError::InvalidSessionId
    );
    require!(params.stake_amount > 0, EggsError::ZeroAmount);

    let player_key = ctx.accounts.player.key();
    let player_balance = &mut ctx.accounts.player_balance;
    initialize_or_validate_player_balance(player_balance, player_key, ctx.bumps.player_balance)?;

    require!(
        !player_balance.has_active_session(),
        EggsError::SessionAlreadyActive
    );
    require!(
        player_balance.available_balance >= params.stake_amount,
        EggsError::InsufficientAvailableBalance
    );

    player_balance.available_balance =
        checked_sub(player_balance.available_balance, params.stake_amount)?;
    player_balance.locked_balance =
        checked_add(player_balance.locked_balance, params.stake_amount)?;
    player_balance.active_session = params.session_id;

    ctx.accounts.config.total_available_balance = checked_sub(
        ctx.accounts.config.total_available_balance,
        params.stake_amount,
    )?;
    ctx.accounts.config.total_locked_balance = checked_add(
        ctx.accounts.config.total_locked_balance,
        params.stake_amount,
    )?;

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
    require!(
        session.session_id == params.session_id,
        EggsError::InvalidSessionId
    );
    require!(session.active, EggsError::SessionNotActive);
    require!(!session.settled, EggsError::SessionAlreadySettled);
    require_keys_eq!(
        session.player,
        params.player,
        EggsError::ResolutionPlayerMismatch
    );
    require!(
        session.stake_amount == params.stake_amount,
        EggsError::ResolutionStakeMismatch
    );

    if params.outcome == OUTCOME_CASHED_OUT {
        let expected_payout =
            calculate_cashout_payout(params.stake_amount, params.final_multiplier_bp)?;
        require!(
            expected_payout == params.payout_amount,
            EggsError::ResolutionPayoutMismatch
        );
    } else {
        require!(
            params.payout_amount == 0,
            EggsError::CrashResolutionMustHaveZeroPayout
        );
    }

    let player_balance = &mut ctx.accounts.player_balance;
    let player_balance_bump = player_balance.bump;
    initialize_or_validate_player_balance(player_balance, params.player, player_balance_bump)?;
    require!(
        player_balance.locked_balance >= params.stake_amount,
        EggsError::InsufficientLockedBalance
    );

    player_balance.locked_balance =
        checked_sub(player_balance.locked_balance, params.stake_amount)?;
    player_balance.active_session = ZERO_SESSION_ID;
    config.total_locked_balance = checked_sub(config.total_locked_balance, params.stake_amount)?;

    if params.outcome == OUTCOME_CASHED_OUT {
        apply_cashout(
            config,
            player_balance,
            params.stake_amount,
            params.payout_amount,
        )?;
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
    require!(
        session.session_id == session_id,
        EggsError::InvalidSessionId
    );
    require!(session.active, EggsError::SessionNotActive);
    require!(!session.settled, EggsError::SessionAlreadySettled);

    let expires_at = checked_add_i64(session.started_at, config.session_expiry_delay)?;
    let now = Clock::get()?.unix_timestamp;
    require!(now > expires_at, EggsError::SessionNotExpired);

    let player_balance = &mut ctx.accounts.player_balance;
    let player_balance_bump = player_balance.bump;
    initialize_or_validate_player_balance(player_balance, session.player, player_balance_bump)?;
    require!(
        player_balance.locked_balance >= session.stake_amount,
        EggsError::InsufficientLockedBalance
    );

    player_balance.locked_balance =
        checked_sub(player_balance.locked_balance, session.stake_amount)?;
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
    validate_egg_pass_claim(&params)?;
    require!(params.issued_at > 0, EggsError::InvalidEggPassIssuedAt);
    require!(
        params.expiry > params.issued_at,
        EggsError::InvalidEggPassExpiry
    );

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
        require!(
            params.issued_at >= egg_pass.issued_at,
            EggsError::StaleEggPassClaim
        );
        require!(
            params.tier >= egg_pass.tier,
            EggsError::EggPassTierDowngrade
        );
    }

    egg_pass.tier = params.tier;
    egg_pass.highest_checkpoint = params.highest_checkpoint;
    egg_pass.cp2_cashouts = params.cp2_cashouts;
    egg_pass.cp4_cashouts = params.cp4_cashouts;
    egg_pass.cp6_cashouts = params.cp6_cashouts;
    egg_pass.cp8_cashouts = params.cp8_cashouts;
    egg_pass.reputation_score = params.reputation_score;
    egg_pass.issued_at = params.issued_at;
    egg_pass.expiry = params.expiry;
    egg_pass.revoked = false;

    let used_nonce = &mut ctx.accounts.used_nonce;
    used_nonce.nonce = params.nonce;
    used_nonce.bump = ctx.bumps.used_nonce;

    emit!(EggPassClaimed {
        player: player_key,
        tier: params.tier,
        highest_checkpoint: params.highest_checkpoint,
        cp2_cashouts: params.cp2_cashouts,
        cp4_cashouts: params.cp4_cashouts,
        cp6_cashouts: params.cp6_cashouts,
        cp8_cashouts: params.cp8_cashouts,
        reputation_score: params.reputation_score,
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

fn require_mint_authority(
    mint_authority: &COption<Pubkey>,
    expected_authority: Pubkey,
) -> Result<()> {
    match mint_authority {
        COption::Some(authority) if *authority == expected_authority => Ok(()),
        _ => err!(EggsError::InvalidMintAuthority),
    }
}

fn normalize_expiry_delay(session_expiry_delay: i64) -> Result<i64> {
    if session_expiry_delay == 0 {
        return Ok(DEFAULT_SESSION_EXPIRY_DELAY);
    }

    require!(
        session_expiry_delay > 0,
        EggsError::InvalidSessionExpiryDelay
    );
    Ok(session_expiry_delay)
}

fn validate_egg_pass_claim(params: &EggPassClaimParams) -> Result<()> {
    require!(
        params.tier >= 1 && params.tier <= 4,
        EggsError::InvalidEggPassTier
    );
    require!(
        params.reputation_score > 0,
        EggsError::InvalidEggPassEvidence
    );

    match params.tier {
        1 => {
            require!(
                params.highest_checkpoint >= 2,
                EggsError::InvalidEggPassEvidence
            );
            require!(params.cp2_cashouts >= 3, EggsError::InvalidEggPassEvidence);
        }
        2 => {
            require!(
                params.highest_checkpoint >= 4,
                EggsError::InvalidEggPassEvidence
            );
            require!(params.cp4_cashouts >= 4, EggsError::InvalidEggPassEvidence);
        }
        3 => {
            require!(
                params.highest_checkpoint >= 6,
                EggsError::InvalidEggPassEvidence
            );
            require!(params.cp6_cashouts >= 4, EggsError::InvalidEggPassEvidence);
        }
        4 => {
            require!(
                params.highest_checkpoint >= 8,
                EggsError::InvalidEggPassEvidence
            );
            require!(params.cp8_cashouts >= 3, EggsError::InvalidEggPassEvidence);
        }
        _ => return err!(EggsError::InvalidEggPassTier),
    }

    Ok(())
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

    require_keys_eq!(
        player_balance.owner,
        owner,
        EggsError::PlayerBalanceOwnerMismatch
    );
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
        require!(
            config.treasury_balance >= treasury_needed,
            EggsError::InsufficientTreasury
        );
        config.treasury_balance = checked_sub(config.treasury_balance, treasury_needed)?;
    } else if stake_amount > payout_amount {
        let retained_amount = checked_sub(stake_amount, payout_amount)?;
        config.treasury_balance = checked_add(config.treasury_balance, retained_amount)?;
    }

    player_balance.available_balance =
        checked_add(player_balance.available_balance, payout_amount)?;
    config.total_available_balance = checked_add(config.total_available_balance, payout_amount)?;
    Ok(())
}

fn checked_add(lhs: u64, rhs: u64) -> Result<u64> {
    lhs.checked_add(rhs)
        .ok_or_else(|| error!(EggsError::ArithmeticOverflow))
}

fn checked_sub(lhs: u64, rhs: u64) -> Result<u64> {
    lhs.checked_sub(rhs)
        .ok_or_else(|| error!(EggsError::ArithmeticOverflow))
}

fn checked_add_i64(lhs: i64, rhs: i64) -> Result<i64> {
    lhs.checked_add(rhs)
        .ok_or_else(|| error!(EggsError::ArithmeticOverflow))
}


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
    
    #[account(seeds = [b"vault-authority"], bump = config.vault_authority_bump)]
    pub vault_authority: UncheckedAccount<'info>,
    #[account(mut)]
    pub vault_token_account: Account<'info, TokenAccount>,
    
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
    use super::{
        calculate_cashout_payout, require_mint_authority, validate_egg_pass_claim,
        EggPassClaimParams,
    };
    use anchor_lang::prelude::Pubkey;
    use anchor_lang::solana_program::program_option::COption;

    fn egg_pass_claim_params(tier: u8) -> EggPassClaimParams {
        EggPassClaimParams {
            tier,
            highest_checkpoint: 8,
            cp2_cashouts: 3,
            cp4_cashouts: 4,
            cp6_cashouts: 4,
            cp8_cashouts: 3,
            reputation_score: 800,
            issued_at: 1,
            expiry: 2,
            nonce: [1; 32],
        }
    }

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

    #[test]
    fn validate_egg_pass_claim_should_accept_valid_tier_evidence() {
        assert!(validate_egg_pass_claim(&egg_pass_claim_params(1)).is_ok());
        assert!(validate_egg_pass_claim(&egg_pass_claim_params(2)).is_ok());
        assert!(validate_egg_pass_claim(&egg_pass_claim_params(3)).is_ok());
        assert!(validate_egg_pass_claim(&egg_pass_claim_params(4)).is_ok());
    }

    #[test]
    fn validate_egg_pass_claim_should_reject_missing_tier_evidence() {
        let mut params = egg_pass_claim_params(2);
        params.highest_checkpoint = 3;
        assert!(validate_egg_pass_claim(&params).is_err());

        let mut params = egg_pass_claim_params(4);
        params.cp8_cashouts = 2;
        assert!(validate_egg_pass_claim(&params).is_err());
    }

    #[test]
    fn require_mint_authority_should_match_vault_authority() {
        let authority = Pubkey::new_unique();
        assert!(require_mint_authority(&COption::Some(authority), authority).is_ok());
        assert!(require_mint_authority(&COption::Some(Pubkey::new_unique()), authority).is_err());
        assert!(require_mint_authority(&COption::None, authority).is_err());
    }
}
