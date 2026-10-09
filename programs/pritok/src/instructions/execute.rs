//! Operator-run execution: the platform operator pushes a payout to every holder,
//! so a corporate action completes without each investor having to claim it.
//! Money can only reach the holder's own canonical account, and the receipt is the
//! same PDA as a wallet or bank claim, so a payout still happens exactly once.

use anchor_lang::prelude::*;
use anchor_spl::token_2022::{
    self,
    spl_token_2022::{
        extension::{BaseStateWithExtensions, ExtensionType, StateWithExtensions},
        state::Mint as SplMint,
    },
    Token2022,
};
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::errors::PritokError;
use crate::state::*;
use crate::token_ops;

use super::payout::{check_reserve, pay_event, settle_maturity};

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

#[derive(Accounts)]
#[instruction(maturity_action_id: u8, coupon_action_id: u8)]
pub struct RedeemFor<'info> {
    #[account(mut)]
    pub operator: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump, has_one = operator @ PritokError::NotOperator)]
    pub config: Box<Account<'info, Config>>,
    /// CHECK: holder wallet; bound through the holder PDA seeds.
    pub owner: UncheckedAccount<'info>,
    #[account(mut, has_one = payment_mint, has_one = bond_mint)]
    pub bond: Box<Account<'info, Bond>>,
    #[account(mut, seeds = [b"holder", bond.key().as_ref(), owner.key().as_ref()], bump = holder.bump)]
    pub holder: Box<Account<'info, Holder>>,
    #[account(
        init,
        payer = operator,
        space = 8 + Claim::INIT_SPACE,
        seeds = [b"claim", bond.key().as_ref(), &[maturity_action_id], owner.key().as_ref()],
        bump
    )]
    pub maturity_claim: Box<Account<'info, Claim>>,
    /// CHECK: receipt for the last coupon; created here if that coupon is paid now.
    #[account(
        mut,
        seeds = [b"claim", bond.key().as_ref(), &[coupon_action_id], owner.key().as_ref()],
        bump
    )]
    pub coupon_claim: UncheckedAccount<'info>,
    /// CHECK: bond mint, bound to `bond` by has_one.
    #[account(mut)]
    pub bond_mint: UncheckedAccount<'info>,
    /// CHECK: holder's canonical bond ATA, checked in the handler.
    #[account(mut)]
    pub owner_bond_ata: UncheckedAccount<'info>,
    pub payment_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, associated_token::mint = payment_mint, associated_token::authority = bond, associated_token::token_program = payment_token_program)]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    /// The holder's own associated account for the payment token.
    #[account(mut, associated_token::mint = payment_mint, associated_token::authority = owner, associated_token::token_program = payment_token_program)]
    pub owner_payment: Box<InterfaceAccount<'info, TokenAccount>>,
    pub bond_token_program: Program<'info, Token2022>,
    pub payment_token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

/// Operator-run redemption: pays principal (and the last coupon if still due) to the
/// holder's own account and burns the holder's bonds through the bond PDA, which is
/// the mint's permanent delegate. Issues created before that extension cannot use it.
pub fn redeem_for_handler(mut ctx: Context<RedeemFor>, maturity_action_id: u8, coupon_action_id: u8) -> Result<()> {
    {
        let data = ctx.accounts.bond_mint.try_borrow_data()?;
        let state = StateWithExtensions::<SplMint>::unpack(&data)?;
        require!(
            state.get_extension_types()?.contains(&ExtensionType::PermanentDelegate),
            PritokError::OperatorRedemptionUnavailable
        );
    }
    let now = Clock::get()?.unix_timestamp;
    let a = &mut ctx.accounts;
    settle_maturity(
        &mut a.bond,
        &mut a.holder,
        &mut a.maturity_claim,
        ctx.bumps.maturity_claim,
        &a.coupon_claim.to_account_info(),
        ctx.bumps.coupon_claim,
        maturity_action_id,
        coupon_action_id,
        &a.operator.to_account_info(),
        &a.system_program.to_account_info(),
        &a.payment_token_program,
        &a.vault,
        &a.payment_mint,
        &a.owner_payment,
        now,
    )?;

    let units = a.holder.balance;
    token_ops::require_canonical_ata(&a.owner_bond_ata.key(), &a.owner.key(), &a.bond_mint.key())?;
    let token_program = a.bond_token_program.to_account_info();
    let ata = a.owner_bond_ata.to_account_info();
    let mint = a.bond_mint.to_account_info();
    let bond_info = a.bond.to_account_info();
    let bond_id = a.bond.bond_id.to_le_bytes();
    let seeds: &[&[u8]] = &[b"bond", a.bond.issuer.as_ref(), &bond_id, &[a.bond.bump]];
    let signer = &[seeds];
    token_ops::thaw(&token_program, &ata, &mint, &bond_info, signer)?;
    token_2022::burn(
        CpiContext::new_with_signer(
            token_program.clone(),
            token_2022::Burn { mint: mint.clone(), from: ata.clone(), authority: bond_info.clone() },
            signer,
        ),
        units,
    )?;
    token_ops::freeze(&token_program, &ata, &mint, &bond_info, signer)?;

    a.holder.balance = 0;
    a.bond.supply -= units;
    check_reserve(&mut a.vault, &a.bond)
}
