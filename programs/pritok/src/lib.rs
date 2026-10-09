use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod state;
pub mod token_ops;

pub use instructions::*;

declare_id!("9LMSMqD3xMBaNdfRb4bKDT3MBTX8ry1Na84rMSJ787aY");

#[program]
pub mod pritok {
    use super::*;

    pub fn init_config(ctx: Context<InitConfig>, payment_mints: Vec<Pubkey>) -> Result<()> {
        instructions::config::init_config_handler(ctx, payment_mints)
    }

    pub fn allow_holder(ctx: Context<AllowHolder>) -> Result<()> {
        instructions::config::allow_holder_handler(ctx)
    }

    pub fn create_bond(ctx: Context<CreateBond>, params: CreateBondParams) -> Result<()> {
        instructions::create_bond::create_bond_handler(ctx, params)
    }

    pub fn subscribe(ctx: Context<Subscribe>, units: u64) -> Result<()> {
        instructions::subscribe::subscribe_handler(ctx, units)
    }

    pub fn close_subscription(ctx: Context<CloseSubscription>) -> Result<()> {
        instructions::subscribe::close_subscription_handler(ctx)
    }

    pub fn transfer_bond(ctx: Context<TransferBond>, units: u64) -> Result<()> {
        instructions::transfer::transfer_bond_handler(ctx, units)
    }

    pub fn fund_action(ctx: Context<FundAction>, action_id: u8, amount: u64) -> Result<()> {
        instructions::payout::fund_action_handler(ctx, action_id, amount)
    }

    pub fn mark_default(ctx: Context<MarkDefault>, action_id: u8) -> Result<()> {
        instructions::payout::mark_default_handler(ctx, action_id)
    }

    pub fn claim(ctx: Context<ClaimPayout>, action_id: u8) -> Result<()> {
        instructions::payout::claim_handler(ctx, action_id)
    }

    pub fn declare_partial_redemption(
        ctx: Context<DeclarePartialRedemption>,
        coupon_action_id: u8,
        redeem_bps: u16,
    ) -> Result<()> {
        instructions::payout::declare_partial_redemption_handler(ctx, coupon_action_id, redeem_bps)
    }

    pub fn redeem(ctx: Context<Redeem>, maturity_action_id: u8, coupon_action_id: u8) -> Result<()> {
        instructions::payout::redeem_handler(ctx, maturity_action_id, coupon_action_id)
    }

    pub fn revoke_holder(ctx: Context<RevokeHolder>) -> Result<()> {
        instructions::config::revoke_holder_handler(ctx)
    }

    pub fn set_paused(ctx: Context<SetPaused>, paused: bool) -> Result<()> {
        instructions::config::set_paused_handler(ctx, paused)
    }

    pub fn claim_to_bank(ctx: Context<ClaimToBank>, action_id: u8) -> Result<()> {
        instructions::bank::claim_to_bank_handler(ctx, action_id)
    }

    pub fn confirm_bank_payment(ctx: Context<ConfirmBankPayment>, action_id: u8, bank_ref_hash: [u8; 32]) -> Result<()> {
        instructions::bank::confirm_bank_payment_handler(ctx, action_id, bank_ref_hash)
    }

    pub fn trade_dvp(ctx: Context<TradeDvp>, units: u64, clean_price_bps: u16, max_total: u64) -> Result<()> {
        instructions::trade::trade_dvp_handler(ctx, units, clean_price_bps, max_total)
    }

    pub fn pay_holder(ctx: Context<PayHolder>, action_id: u8) -> Result<()> {
        instructions::execute::pay_holder_handler(ctx, action_id)
    }
}
