use anchor_lang::prelude::*;

#[error_code]
pub enum EggsError {
    #[msg("The caller is not the configured admin")]
    UnauthorizedAdmin,
    #[msg("The backend signer does not match the configured signer")]
    InvalidBackendSigner,
    #[msg("The program is paused")]
    ProgramPaused,
    #[msg("The amount must be greater than zero")]
    ZeroAmount,
    #[msg("The session identifier cannot be empty")]
    InvalidSessionId,
    #[msg("The session expiry delay must be positive")]
    InvalidSessionExpiryDelay,
    #[msg("The player already has an active session")]
    SessionAlreadyActive,
    #[msg("The session is already settled")]
    SessionAlreadySettled,
    #[msg("The session is not active")]
    SessionNotActive,
    #[msg("The session has not expired yet")]
    SessionNotExpired,
    #[msg("The settlement approval has expired")]
    ResolutionExpired,
    #[msg("The settlement outcome is invalid")]
    InvalidOutcome,
    #[msg("The settlement player does not match the session player")]
    ResolutionPlayerMismatch,
    #[msg("The settlement stake does not match the session stake")]
    ResolutionStakeMismatch,
    #[msg("The settlement payout does not match the multiplier")]
    ResolutionPayoutMismatch,
    #[msg("A crash resolution must have zero payout")]
    CrashResolutionMustHaveZeroPayout,
    #[msg("The account does not have enough available balance")]
    InsufficientAvailableBalance,
    #[msg("The account does not have enough locked balance")]
    InsufficientLockedBalance,
    #[msg("The treasury balance is insufficient for this payout")]
    InsufficientTreasury,
    #[msg("The player balance account belongs to a different owner")]
    PlayerBalanceOwnerMismatch,
    #[msg("The provided player does not match the expected player")]
    InvalidPlayer,
    #[msg("The claim amount must be greater than zero")]
    InvalidClaimAmount,
    #[msg("The token mint authority must be the program vault authority")]
    InvalidMintAuthority,
    #[msg("The EggPass tier must be between 1 and 4")]
    InvalidEggPassTier,
    #[msg("The EggPass evidence does not satisfy the requested tier")]
    InvalidEggPassEvidence,
    #[msg("The EggPass tier cannot be downgraded")]
    EggPassTierDowngrade,
    #[msg("The EggPass issued timestamp must be positive")]
    InvalidEggPassIssuedAt,
    #[msg("The EggPass expiry timestamp must be greater than the issue timestamp")]
    InvalidEggPassExpiry,
    #[msg("The EggPass claim has expired")]
    EggPassClaimExpired,
    #[msg("The new EggPass claim is older than the stored EggPass")]
    StaleEggPassClaim,
    #[msg("The EggPass is already revoked")]
    EggPassAlreadyRevoked,
    #[msg("Arithmetic overflow or underflow")]
    ArithmeticOverflow,
}
