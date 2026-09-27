use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_2022::{self, Token2022};

use crate::errors::PritokError;
use crate::state::*;
use crate::token_ops;

#[derive(Accounts)]
pub struct TransferBond<'info> {
    #[account(mut)]
    pub from: Signer<'info>,
    /// CHECK: receiving wallet; admission is checked through its holder record.
    pub to: UncheckedAccount<'info>,
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(has_one = bond_mint)]
    pub bond: Box<Account<'info, Bond>>,
    #[account(
        mut,
        seeds = [b"holder", bond.key().as_ref(), from.key().as_ref()],
        bump = from_holder.bump
    )]
    pub from_holder: Box<Account<'info, Holder>>,
    #[account(
        mut,
        seeds = [b"holder", bond.key().as_ref(), to.key().as_ref()],
        bump = to_holder.bump
    )]
    pub to_holder: Box<Account<'info, Holder>>,
    /// CHECK: bond mint, bound to `bond` by has_one.
    pub bond_mint: UncheckedAccount<'info>,
    /// CHECK: sender's canonical bond ATA.
    #[account(mut)]
    pub from_ata: UncheckedAccount<'info>,
    /// CHECK: receiver's canonical bond ATA, created idempotently.
    #[account(mut)]
    pub to_ata: UncheckedAccount<'info>,
    pub bond_token_program: Program<'info, Token2022>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn transfer_bond_handler(ctx: Context<TransferBond>, units: u64) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let bond = &ctx.accounts.bond;
    require!(!ctx.accounts.config.paused, PritokError::Paused);
    require!(units > 0, PritokError::ZeroAmount);
    require_keys_neq!(ctx.accounts.from.key(), ctx.accounts.to.key(), PritokError::SelfTransfer);
    require!(ctx.accounts.to_holder.allowed, PritokError::HolderNotAllowed);
    require!(now < bond.maturity_record_ts(), PritokError::TransfersClosed);
    require!(ctx.accounts.from_holder.balance >= units, PritokError::InsufficientBalance);
    let mint_key = ctx.accounts.bond_mint.key();
    token_ops::require_canonical_ata(&ctx.accounts.from_ata.key(), &ctx.accounts.from.key(), &mint_key)?;
    token_ops::require_canonical_ata(&ctx.accounts.to_ata.key(), &ctx.accounts.to.key(), &mint_key)?;

    let token_program = ctx.accounts.bond_token_program.to_account_info();
    let mint = ctx.accounts.bond_mint.to_account_info();
    let from_ata = ctx.accounts.from_ata.to_account_info();
    let to_ata = ctx.accounts.to_ata.to_account_info();
    let bond_info = ctx.accounts.bond.to_account_info();
    token_ops::create_ata_idempotent(
        &ctx.accounts.from.to_account_info(),
        &to_ata,
        &ctx.accounts.to.to_account_info(),
        &mint,
        &ctx.accounts.system_program.to_account_info(),
        &token_program,
        &ctx.accounts.associated_token_program.to_account_info(),
    )?;

    let bond_id = bond.bond_id.to_le_bytes();
    let seeds: &[&[u8]] = &[b"bond", bond.issuer.as_ref(), &bond_id, &[bond.bump]];
    let signer = &[seeds];
    token_ops::thaw(&token_program, &from_ata, &mint, &bond_info, signer)?;
    token_ops::thaw(&token_program, &to_ata, &mint, &bond_info, signer)?;
    token_2022::transfer_checked(
        CpiContext::new(
            token_program.clone(),
            token_2022::TransferChecked {
                from: from_ata.clone(),
                mint: mint.clone(),
                to: to_ata.clone(),
                authority: ctx.accounts.from.to_account_info(),
            },
        ),
        units,
        0,
    )?;
    token_ops::freeze(&token_program, &from_ata, &mint, &bond_info, signer)?;
    token_ops::freeze(&token_program, &to_ata, &mint, &bond_info, signer)?;

    let from_holder = &mut ctx.accounts.from_holder;
    from_holder.sync(bond, now);
    from_holder.balance -= units;
    let to_holder = &mut ctx.accounts.to_holder;
    to_holder.sync(bond, now);
    to_holder.balance = to_holder.balance.checked_add(units).ok_or(PritokError::Overflow)?;
    Ok(())
}
