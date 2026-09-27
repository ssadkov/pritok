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
}
