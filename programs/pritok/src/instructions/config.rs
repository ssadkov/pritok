use anchor_lang::prelude::*;

use crate::errors::PritokError;
use crate::state::*;

#[derive(Accounts)]
pub struct InitConfig<'info> {
    #[account(mut)]
    pub operator: Signer<'info>,
    #[account(init, payer = operator, space = 8 + Config::INIT_SPACE, seeds = [b"config"], bump)]
    pub config: Account<'info, Config>,
    pub system_program: Program<'info, System>,
}

pub fn init_config_handler(ctx: Context<InitConfig>, payment_mints: Vec<Pubkey>) -> Result<()> {
    require!(payment_mints.len() <= MAX_PAYMENT_MINTS, PritokError::TooManyPaymentMints);
    let config = &mut ctx.accounts.config;
    config.operator = ctx.accounts.operator.key();
    config.paused = false;
    config.payment_mints[..payment_mints.len()].copy_from_slice(&payment_mints);
    config.payment_mints_len = payment_mints.len() as u8;
    config.bump = ctx.bumps.config;
    Ok(())
}

#[derive(Accounts)]
pub struct AllowHolder<'info> {
    #[account(mut)]
    pub operator: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump, has_one = operator @ PritokError::NotOperator)]
    pub config: Account<'info, Config>,
    pub bond: Box<Account<'info, Bond>>,
    /// CHECK: wallet being admitted; only its key is used.
    pub owner: UncheckedAccount<'info>,
    #[account(
        init_if_needed,
        payer = operator,
        space = 8 + Holder::INIT_SPACE,
        seeds = [b"holder", bond.key().as_ref(), owner.key().as_ref()],
        bump
    )]
    pub holder: Account<'info, Holder>,
    pub system_program: Program<'info, System>,
}

/// Creates the holder record on first admission; re-admits a revoked holder
/// without touching balances or recorded entitlements.
pub fn allow_holder_handler(ctx: Context<AllowHolder>) -> Result<()> {
    let holder = &mut ctx.accounts.holder;
    if holder.owner == Pubkey::default() {
        holder.bond = ctx.accounts.bond.key();
        holder.owner = ctx.accounts.owner.key();
        holder.bump = ctx.bumps.holder;
    }
    holder.allowed = true;
    Ok(())
}
