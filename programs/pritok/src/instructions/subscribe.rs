use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_2022::{self, Token2022};
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface};

use crate::errors::PritokError;
use crate::state::*;
use crate::token_ops;

#[derive(Accounts)]
pub struct Subscribe<'info> {
    #[account(mut)]
    pub investor: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut, has_one = issuer, has_one = bond_mint, has_one = payment_mint)]
    pub bond: Box<Account<'info, Bond>>,
    /// CHECK: bond issuer, receives the placement proceeds.
    pub issuer: UncheckedAccount<'info>,
    #[account(
        mut,
        seeds = [b"holder", bond.key().as_ref(), investor.key().as_ref()],
        bump = holder.bump
    )]
    pub holder: Box<Account<'info, Holder>>,
    /// CHECK: bond mint, bound to `bond` by has_one.
    #[account(mut)]
    pub bond_mint: UncheckedAccount<'info>,
    /// CHECK: investor's canonical bond ATA, created idempotently.
    #[account(mut)]
    pub investor_bond_ata: UncheckedAccount<'info>,
    pub payment_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        mut,
        token::mint = payment_mint,
        token::authority = investor,
        token::token_program = payment_token_program
    )]
    pub investor_payment: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        mut,
        associated_token::mint = payment_mint,
        associated_token::authority = issuer,
        associated_token::token_program = payment_token_program
    )]
    pub issuer_payment: Box<InterfaceAccount<'info, TokenAccount>>,
    pub bond_token_program: Program<'info, Token2022>,
    pub payment_token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn subscribe_handler(ctx: Context<Subscribe>, units: u64) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    require!(!ctx.accounts.config.paused, PritokError::Paused);
    require!(units > 0, PritokError::ZeroAmount);
    require!(ctx.accounts.holder.allowed, PritokError::HolderNotAllowed);
    require!(
        !ctx.accounts.bond.subscription_closed && now < ctx.accounts.bond.subscription_end_ts,
        PritokError::SubscriptionClosed
    );
    token_ops::require_canonical_ata(
        &ctx.accounts.investor_bond_ata.key(),
        &ctx.accounts.investor.key(),
        &ctx.accounts.bond_mint.key(),
    )?;

    // Placement proceeds go straight to the issuer.
    let price = ctx
        .accounts
        .bond
        .face_value
        .checked_mul(units)
        .ok_or(PritokError::Overflow)?;
    token_interface::transfer_checked(
        CpiContext::new(
            ctx.accounts.payment_token_program.to_account_info(),
            token_interface::TransferChecked {
                from: ctx.accounts.investor_payment.to_account_info(),
                mint: ctx.accounts.payment_mint.to_account_info(),
                to: ctx.accounts.issuer_payment.to_account_info(),
                authority: ctx.accounts.investor.to_account_info(),
            },
        ),
        price,
        ctx.accounts.payment_mint.decimals,
    )?;

    let token_program = ctx.accounts.bond_token_program.to_account_info();
    let ata = ctx.accounts.investor_bond_ata.to_account_info();
    let mint = ctx.accounts.bond_mint.to_account_info();
    let bond_info = ctx.accounts.bond.to_account_info();
    token_ops::create_ata_idempotent(
        &ctx.accounts.investor.to_account_info(),
        &ata,
        &ctx.accounts.investor.to_account_info(),
        &mint,
        &ctx.accounts.system_program.to_account_info(),
        &token_program,
        &ctx.accounts.associated_token_program.to_account_info(),
    )?;

    let bond = &ctx.accounts.bond;
    let bond_id = bond.bond_id.to_le_bytes();
    let seeds: &[&[u8]] = &[b"bond", bond.issuer.as_ref(), &bond_id, &[bond.bump]];
    let signer = &[seeds];
    token_ops::thaw(&token_program, &ata, &mint, &bond_info, signer)?;
    token_2022::mint_to(
        CpiContext::new_with_signer(
            token_program.clone(),
            token_2022::MintTo {
                mint: mint.clone(),
                to: ata.clone(),
                authority: bond_info.clone(),
            },
            signer,
        ),
        units,
    )?;
    token_ops::freeze(&token_program, &ata, &mint, &bond_info, signer)?;

    let holder = &mut ctx.accounts.holder;
    holder.sync(&ctx.accounts.bond, now);
    holder.balance = holder.balance.checked_add(units).ok_or(PritokError::Overflow)?;
    let bond = &mut ctx.accounts.bond;
    bond.supply = bond.supply.checked_add(units).ok_or(PritokError::Overflow)?;
    Ok(())
}

#[derive(Accounts)]
pub struct CloseSubscription<'info> {
    #[account(mut)]
    pub bond: Box<Account<'info, Bond>>,
}

/// Permissionless once the subscription window has ended: fixes the number of
/// bonds used for every entitlement calculation of this issue.
pub fn close_subscription_handler(ctx: Context<CloseSubscription>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let bond = &mut ctx.accounts.bond;
    require!(now >= bond.subscription_end_ts, PritokError::SubscriptionOpen);
    require!(!bond.subscription_closed, PritokError::SubscriptionClosed);
    bond.subscription_closed = true;
    bond.issued_units = bond.supply;
    Ok(())
}
