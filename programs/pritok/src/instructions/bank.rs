//! Bank off-ramp: a holder (or the registrar for a holder without a wallet) routes a
//! payout to the paying agent instead of the holder's wallet. The money leaves the vault
//! onchain; only the final bank transfer is attested by the paying agent.

use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::errors::PritokError;
use crate::state::*;

use super::payout::pay_event;

#[derive(Accounts)]
#[instruction(action_id: u8)]
pub struct ClaimToBank<'info> {
    /// The holder, or the registrar acting for the holder.
    #[account(mut)]
    pub authority: Signer<'info>,
    /// CHECK: holder wallet; bound through the holder PDA seeds.
    pub owner: UncheckedAccount<'info>,
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(mut, has_one = payment_mint)]
    pub bond: Box<Account<'info, Bond>>,
    #[account(seeds = [b"holder", bond.key().as_ref(), owner.key().as_ref()], bump = holder.bump)]
    pub holder: Box<Account<'info, Holder>>,
    /// Same seeds as a wallet claim: a payout goes either to the wallet or to the bank, once.
    #[account(
        init,
        payer = authority,
        space = 8 + Claim::INIT_SPACE,
        seeds = [b"claim", bond.key().as_ref(), &[action_id], owner.key().as_ref()],
        bump
    )]
    pub claim: Box<Account<'info, Claim>>,
    pub payment_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, associated_token::mint = payment_mint, associated_token::authority = bond, associated_token::token_program = payment_token_program)]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    /// Paying agent's account: the registrar's associated account for the payment token.
    #[account(mut, associated_token::mint = payment_mint, associated_token::authority = config.operator, associated_token::token_program = payment_token_program)]
    pub agent_payment: Box<InterfaceAccount<'info, TokenAccount>>,
    pub payment_token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn claim_to_bank_handler(ctx: Context<ClaimToBank>, action_id: u8) -> Result<()> {
    let authority = ctx.accounts.authority.key();
    require!(
        authority == ctx.accounts.owner.key() || authority == ctx.accounts.config.operator,
        PritokError::NotHolderOrOperator
    );
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
        &ctx.accounts.agent_payment,
    )?;
    ctx.accounts.claim.status = claim_status::BANK_REQUESTED;
    super::payout::check_reserve(&mut ctx.accounts.vault, &ctx.accounts.bond)
}

#[derive(Accounts)]
#[instruction(action_id: u8)]
pub struct ConfirmBankPayment<'info> {
    pub operator: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump, has_one = operator @ PritokError::NotOperator)]
    pub config: Box<Account<'info, Config>>,
    pub bond: Box<Account<'info, Bond>>,
    /// CHECK: holder wallet; bound through the claim PDA seeds.
    pub owner: UncheckedAccount<'info>,
    #[account(
        mut,
        seeds = [b"claim", bond.key().as_ref(), &[action_id], owner.key().as_ref()],
        bump = claim.bump
    )]
    pub claim: Box<Account<'info, Claim>>,
}

/// The paying agent attests that the bank transfer was made. Only a hash of the
/// payment reference is stored; bank details never go onchain.
pub fn confirm_bank_payment_handler(ctx: Context<ConfirmBankPayment>, _action_id: u8, bank_ref_hash: [u8; 32]) -> Result<()> {
    let claim = &mut ctx.accounts.claim;
    require!(claim.status == claim_status::BANK_REQUESTED, PritokError::NotBankRequest);
    require!(bank_ref_hash != [0; 32], PritokError::EmptyBankRef);
    claim.status = claim_status::BANK_CONFIRMED;
    claim.bank_ref_hash = bank_ref_hash;
    Ok(())
}
