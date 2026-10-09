//! Operator-run execution: the platform operator pushes a payout to every holder,
//! so a corporate action completes without each investor having to claim it.
//! Money can only reach the holder's own canonical account, and the receipt is the
//! same PDA as a wallet or bank claim, so a payout still happens exactly once.

use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::errors::PritokError;
use crate::state::*;

use super::payout::{check_reserve, pay_event};

#[derive(Accounts)]
#[instruction(action_id: u8)]
pub struct PayHolder<'info> {
    #[account(mut)]
    pub operator: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump, has_one = operator @ PritokError::NotOperator)]
    pub config: Box<Account<'info, Config>>,
    /// CHECK: holder wallet; bound through the holder PDA seeds.
    pub owner: UncheckedAccount<'info>,
    #[account(mut, has_one = payment_mint)]
    pub bond: Box<Account<'info, Bond>>,
    #[account(seeds = [b"holder", bond.key().as_ref(), owner.key().as_ref()], bump = holder.bump)]
    pub holder: Box<Account<'info, Holder>>,
    #[account(
        init,
        payer = operator,
        space = 8 + Claim::INIT_SPACE,
        seeds = [b"claim", bond.key().as_ref(), &[action_id], owner.key().as_ref()],
        bump
    )]
    pub claim: Box<Account<'info, Claim>>,
    pub payment_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, associated_token::mint = payment_mint, associated_token::authority = bond, associated_token::token_program = payment_token_program)]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    /// The holder's own associated account for the payment token: the only place the money can go.
    #[account(mut, associated_token::mint = payment_mint, associated_token::authority = owner, associated_token::token_program = payment_token_program)]
    pub owner_payment: Box<InterfaceAccount<'info, TokenAccount>>,
    pub payment_token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

/// Coupon or partial-redemption payout pushed by the operator to the holder's wallet.
/// Like `claim`, it works for revoked holders and while paused.
pub fn pay_holder_handler(ctx: Context<PayHolder>, action_id: u8) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let pos = ctx.accounts.bond.position(action_id).ok_or(PritokError::UnknownAction)?;
    require!(ctx.accounts.bond.events[pos].kind != kind::MATURITY, PritokError::WrongActionKind);
    pay_event(
        &mut ctx.accounts.bond,
        pos,
        &ctx.accounts.holder,
        &mut ctx.accounts.claim,
        ctx.bumps.claim,
        now,
        &ctx.accounts.payment_token_program,
        &ctx.accounts.vault,
        &ctx.accounts.payment_mint,
        &ctx.accounts.owner_payment,
    )?;
    check_reserve(&mut ctx.accounts.vault, &ctx.accounts.bond)
}
