use anchor_lang::prelude::*;

#[error_code]
pub enum PritokError {
    #[msg("Signer is not the operator")]
    NotOperator,
    #[msg("Too many payment mints")]
    TooManyPaymentMints,
    #[msg("Payment mint is not on the operator's allowlist")]
    PaymentMintNotAllowed,
    #[msg("Payment mint has an extension that changes transfer amounts or routing")]
    PaymentMintExtensionNotAllowed,
    #[msg("Invalid bond parameters")]
    InvalidBondParams,
    #[msg("Holder is not allowed")]
    HolderNotAllowed,
    #[msg("Operations are paused")]
    Paused,
    #[msg("Subscription is closed")]
    SubscriptionClosed,
    #[msg("Subscription is still open")]
    SubscriptionOpen,
    #[msg("Transfers are closed after the maturity record date")]
    TransfersClosed,
    #[msg("Amount must be positive")]
    ZeroAmount,
    #[msg("Insufficient bond balance")]
    InsufficientBalance,
    #[msg("Token account is not the holder's canonical associated token account")]
    NotCanonicalAta,
    #[msg("Cannot transfer to self")]
    SelfTransfer,
    #[msg("Arithmetic overflow")]
    Overflow,
}
