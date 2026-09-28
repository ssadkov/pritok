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
    #[msg("Unknown action")]
    UnknownAction,
    #[msg("Wrong action kind for this instruction")]
    WrongActionKind,
    #[msg("Action is settled through the bank path")]
    BankSettlement,
    #[msg("Funding exceeds the amount required")]
    OverFunding,
    #[msg("Payment date has not arrived")]
    NotPayable,
    #[msg("Action is not fully funded")]
    NotFunded,
    #[msg("Action cannot be marked as defaulted")]
    CannotDefault,
    #[msg("Nothing to pay")]
    NothingToPay,
    #[msg("Payment vault holds less than reserved obligations")]
    VaultBelowReserve,
    #[msg("Record date has already passed")]
    RecordDatePassed,
    #[msg("Event limit reached")]
    TooManyEvents,
    #[msg("Invalid redemption share")]
    InvalidRedemption,
    #[msg("Only the holder or the registrar can request a bank payout")]
    NotHolderOrOperator,
    #[msg("Payout is not awaiting bank confirmation")]
    NotBankRequest,
    #[msg("Bank payment reference is empty")]
    EmptyBankRef,
    #[msg("Price must be positive")]
    InvalidPrice,
    #[msg("Total price exceeds the buyer's limit")]
    PriceAboveLimit,
}
