//! Delivery versus payment: bonds to the buyer and money to the seller in one atomic
//! transaction signed by both. The parties agree the clean price; the program adds the
//! accrued interest itself, so neither side can misstate it.

use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_2022::Token2022;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface};

use crate::errors::PritokError;
use crate::state::*;
use crate::token_ops;

#[derive(Accounts)]
pub struct TradeDvp<'info> {
    #[account(mut)]
    pub seller: Signer<'info>,
    #[account(mut)]
    pub buyer: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(has_one = bond_mint, has_one = payment_mint)]
    pub bond: Box<Account<'info, Bond>>,
    #[account(mut, seeds = [b"holder", bond.key().as_ref(), seller.key().as_ref()], bump = seller_holder.bump)]
    pub seller_holder: Box<Account<'info, Holder>>,
    #[account(mut, seeds = [b"holder", bond.key().as_ref(), buyer.key().as_ref()], bump = buyer_holder.bump)]
    pub buyer_holder: Box<Account<'info, Holder>>,
    /// CHECK: bond mint, bound to `bond` by has_one.
    pub bond_mint: UncheckedAccount<'info>,
    /// CHECK: seller's canonical bond ATA.
    #[account(mut)]
    pub seller_bond_ata: UncheckedAccount<'info>,
    /// CHECK: buyer's canonical bond ATA, created idempotently.
    #[account(mut)]
    pub buyer_bond_ata: UncheckedAccount<'info>,
    pub payment_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, token::mint = payment_mint, token::authority = buyer, token::token_program = payment_token_program)]
    pub buyer_payment: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, token::mint = payment_mint, token::authority = seller, token::token_program = payment_token_program)]
    pub seller_payment: Box<InterfaceAccount<'info, TokenAccount>>,
    pub bond_token_program: Program<'info, Token2022>,
    pub payment_token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

/// `clean_price_bps`: agreed price as a share of the outstanding face value (9 900 = 99%).
/// `max_total`: the most the buyer agreed to pay including accrued interest.
pub fn trade_dvp_handler(ctx: Context<TradeDvp>, units: u64, clean_price_bps: u16, max_total: u64) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let bond = &ctx.accounts.bond;
    require!(!ctx.accounts.config.paused, PritokError::Paused);
    require!(units > 0, PritokError::ZeroAmount);
    require!(clean_price_bps > 0, PritokError::InvalidPrice);
    require_keys_neq!(ctx.accounts.seller.key(), ctx.accounts.buyer.key(), PritokError::SelfTransfer);
    require!(ctx.accounts.buyer_holder.allowed, PritokError::HolderNotAllowed);
    require!(now < bond.maturity_record_ts(), PritokError::TransfersClosed);
    require!(ctx.accounts.seller_holder.balance >= units, PritokError::InsufficientBalance);
    let mint_key = ctx.accounts.bond_mint.key();
    token_ops::require_canonical_ata(&ctx.accounts.seller_bond_ata.key(), &ctx.accounts.seller.key(), &mint_key)?;
    token_ops::require_canonical_ata(&ctx.accounts.buyer_bond_ata.key(), &ctx.accounts.buyer.key(), &mint_key)?;

    // Price per bond = clean price on the outstanding face + accrued interest.
    let (accrued, face) = bond.accrued_per_unit(now).ok_or(PritokError::TransfersClosed)?;
    let clean = (face as u128 * clean_price_bps as u128 / BPS) as u64;
    let per_unit = clean.checked_add(accrued).ok_or(PritokError::Overflow)?;
    let total = per_unit.checked_mul(units).ok_or(PritokError::Overflow)?;
    require!(total <= max_total, PritokError::PriceAboveLimit);

    // Payment leg.
    token_interface::transfer_checked(
        CpiContext::new(
            ctx.accounts.payment_token_program.to_account_info(),
            token_interface::TransferChecked {
                from: ctx.accounts.buyer_payment.to_account_info(),
                mint: ctx.accounts.payment_mint.to_account_info(),
                to: ctx.accounts.seller_payment.to_account_info(),
                authority: ctx.accounts.buyer.to_account_info(),
            },
        ),
        total,
        ctx.accounts.payment_mint.decimals,
    )?;

    // Delivery leg.
    let token_program = ctx.accounts.bond_token_program.to_account_info();
    let mint = ctx.accounts.bond_mint.to_account_info();
    let seller_ata = ctx.accounts.seller_bond_ata.to_account_info();
    let buyer_ata = ctx.accounts.buyer_bond_ata.to_account_info();
    token_ops::create_ata_idempotent(
        &ctx.accounts.buyer.to_account_info(),
        &buyer_ata,
        &ctx.accounts.buyer.to_account_info(),
        &mint,
        &ctx.accounts.system_program.to_account_info(),
        &token_program,
        &ctx.accounts.associated_token_program.to_account_info(),
    )?;
    let bond_id = bond.bond_id.to_le_bytes();
    let seeds: &[&[u8]] = &[b"bond", bond.issuer.as_ref(), &bond_id, &[bond.bump]];
    token_ops::move_frozen(
        &token_program,
        &mint,
        &seller_ata,
        &buyer_ata,
        &ctx.accounts.seller.to_account_info(),
        &ctx.accounts.bond.to_account_info(),
        &[seeds],
        units,
    )?;

    let bond = &ctx.accounts.bond;
    let seller = &mut ctx.accounts.seller_holder;
    seller.sync(bond, now);
    seller.balance -= units;
    let buyer = &mut ctx.accounts.buyer_holder;
    buyer.sync(bond, now);
    buyer.balance = buyer.balance.checked_add(units).ok_or(PritokError::Overflow)?;

    emit!(TradeSettled {
        bond: bond.key(),
        seller: ctx.accounts.seller.key(),
        buyer: ctx.accounts.buyer.key(),
        units,
        clean_price_bps,
        clean_per_unit: clean,
        accrued_per_unit: accrued,
        total,
    });
    Ok(())
}

/// Settlement record in the transaction log: price, accrued interest and total.
#[event]
pub struct TradeSettled {
    pub bond: Pubkey,
    pub seller: Pubkey,
    pub buyer: Pubkey,
    pub units: u64,
    pub clean_price_bps: u16,
    pub clean_per_unit: u64,
    pub accrued_per_unit: u64,
    pub total: u64,
}
