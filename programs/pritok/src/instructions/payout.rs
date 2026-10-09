use anchor_lang::prelude::*;
use anchor_spl::token_2022::{self, Token2022};
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface};

use crate::errors::PritokError;
use crate::state::*;
use crate::token_ops;

fn vault_transfer<'info>(
    token_program: &Interface<'info, TokenInterface>,
    vault: &InterfaceAccount<'info, TokenAccount>,
    mint: &InterfaceAccount<'info, Mint>,
    to: &InterfaceAccount<'info, TokenAccount>,
    bond: &Account<'info, Bond>,
    amount: u64,
) -> Result<()> {
    let bond_id = bond.bond_id.to_le_bytes();
    let seeds: &[&[u8]] = &[b"bond", bond.issuer.as_ref(), &bond_id, &[bond.bump]];
    token_interface::transfer_checked(
        CpiContext::new_with_signer(
            token_program.to_account_info(),
            token_interface::TransferChecked {
                from: vault.to_account_info(),
                mint: mint.to_account_info(),
                to: to.to_account_info(),
                authority: bond.to_account_info(),
            },
            &[seeds],
        ),
        amount,
        mint.decimals,
    )
}

pub(crate) fn check_reserve(vault: &mut InterfaceAccount<TokenAccount>, bond: &Bond) -> Result<()> {
    vault.reload()?;
    require!(vault.amount >= bond.reserved, PritokError::VaultBelowReserve);
    Ok(())
}

/// Pays `holder`'s entitlement for the event at `pos` from the vault and fills the receipt.
/// Shared by `claim` and `redeem`.
#[allow(clippy::too_many_arguments)]
pub(crate) fn pay_event<'info>(
    bond: &mut Account<'info, Bond>,
    pos: usize,
    holder: &Holder,
    receipt: &mut Claim,
    receipt_bump: u8,
    now: i64,
    token_program: &Interface<'info, TokenInterface>,
    vault: &InterfaceAccount<'info, TokenAccount>,
    mint: &InterfaceAccount<'info, Mint>,
    to: &InterfaceAccount<'info, TokenAccount>,
) -> Result<u64> {
    let event = bond.events[pos];
    require!(event.mode == mode::ONCHAIN, PritokError::BankSettlement);
    require!(now >= event.pay_ts, PritokError::NotPayable);
    require!(event.status == event_status::FUNDED, PritokError::NotFunded);
    let units = holder.units_at(bond, pos, now).ok_or(PritokError::NotPayable)?;
    let amount = event.amount_per_unit.checked_mul(units).ok_or(PritokError::Overflow)?;
    require!(amount > 0, PritokError::NothingToPay);
    let claimed = event.claimed.checked_add(amount).ok_or(PritokError::Overflow)?;
    require!(claimed <= event.funded, PritokError::NotFunded);

    vault_transfer(token_program, vault, mint, to, bond, amount)?;
    bond.events[pos].claimed = claimed;
    bond.reserved -= amount;

    receipt.bond = bond.key();
    receipt.owner = holder.owner;
    receipt.action_id = event.action_id;
    receipt.units = units;
    receipt.amount = amount;
    receipt.status = claim_status::PAID;
    receipt.bump = receipt_bump;
    Ok(amount)
}

// ---------------------------------------------------------------- fund_action

#[derive(Accounts)]
pub struct FundAction<'info> {
    pub issuer: Signer<'info>,
    #[account(mut, has_one = issuer, has_one = payment_mint)]
    pub bond: Box<Account<'info, Bond>>,
    pub payment_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, token::mint = payment_mint, token::authority = issuer, token::token_program = payment_token_program)]
    pub issuer_payment: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, associated_token::mint = payment_mint, associated_token::authority = bond, associated_token::token_program = payment_token_program)]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    pub payment_token_program: Interface<'info, TokenInterface>,
}

/// Issuer deposits money for an onchain event. Can be called in parts and after a
/// default; the event opens for claims only when fully funded.
pub fn fund_action_handler(ctx: Context<FundAction>, action_id: u8, amount: u64) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    require!(amount > 0, PritokError::ZeroAmount);
    let bond = &mut ctx.accounts.bond;
    bond.close_subscription_if_due(now);
    require!(bond.subscription_closed, PritokError::SubscriptionOpen);
    let pos = bond.position(action_id).ok_or(PritokError::UnknownAction)?;
    let event = bond.events[pos];
    require!(event.mode == mode::ONCHAIN, PritokError::BankSettlement);
    let required = bond.required(&event).ok_or(PritokError::Overflow)?;
    let funded = event.funded.checked_add(amount).ok_or(PritokError::Overflow)?;
    require!(funded <= required, PritokError::OverFunding);

    token_interface::transfer_checked(
        CpiContext::new(
            ctx.accounts.payment_token_program.to_account_info(),
            token_interface::TransferChecked {
                from: ctx.accounts.issuer_payment.to_account_info(),
                mint: ctx.accounts.payment_mint.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.issuer.to_account_info(),
            },
        ),
        amount,
        ctx.accounts.payment_mint.decimals,
    )?;

    let bond = &mut ctx.accounts.bond;
    bond.events[pos].funded = funded;
    if funded == required {
        // Also cures a default: the debt is paid in full, never written down.
        bond.events[pos].status = event_status::FUNDED;
    }
    bond.reserved = bond.reserved.checked_add(amount).ok_or(PritokError::Overflow)?;
    check_reserve(&mut ctx.accounts.vault, &ctx.accounts.bond)
}

// ---------------------------------------------------------------- mark_default

#[derive(Accounts)]
pub struct MarkDefault<'info> {
    #[account(mut)]
    pub bond: Box<Account<'info, Bond>>,
}

/// Permissionless: after the payment date an underfunded event becomes a public default.
pub fn mark_default_handler(ctx: Context<MarkDefault>, action_id: u8) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let bond = &mut ctx.accounts.bond;
    bond.close_subscription_if_due(now);
    let pos = bond.position(action_id).ok_or(PritokError::UnknownAction)?;
    let event = bond.events[pos];
    require!(
        event.mode == mode::ONCHAIN
            && event.status == event_status::SCHEDULED
            && now >= event.pay_ts
            && Some(event.funded) < bond.required(&event),
        PritokError::CannotDefault
    );
    bond.events[pos].status = event_status::DEFAULTED;
    Ok(())
}

// ---------------------------------------------------------------- claim

#[derive(Accounts)]
#[instruction(action_id: u8)]
pub struct ClaimPayout<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(mut, has_one = payment_mint)]
    pub bond: Box<Account<'info, Bond>>,
    #[account(seeds = [b"holder", bond.key().as_ref(), owner.key().as_ref()], bump = holder.bump)]
    pub holder: Box<Account<'info, Holder>>,
    #[account(
        init,
        payer = owner,
        space = 8 + Claim::INIT_SPACE,
        seeds = [b"claim", bond.key().as_ref(), &[action_id], owner.key().as_ref()],
        bump
    )]
    pub claim: Box<Account<'info, Claim>>,
    pub payment_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, associated_token::mint = payment_mint, associated_token::authority = bond, associated_token::token_program = payment_token_program)]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, token::mint = payment_mint, token::authority = owner, token::token_program = payment_token_program)]
    pub owner_payment: Box<InterfaceAccount<'info, TokenAccount>>,
    pub payment_token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

/// Coupon or partial-redemption payout. Works for revoked holders and while paused:
/// admission and pause never cancel a right that already exists.
pub fn claim_handler(ctx: Context<ClaimPayout>, action_id: u8) -> Result<()> {
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

// ---------------------------------------------------------------- partial redemption

#[derive(Accounts)]
pub struct DeclarePartialRedemption<'info> {
    pub issuer: Signer<'info>,
    #[account(mut, has_one = issuer, has_one = payment_mint)]
    pub bond: Box<Account<'info, Bond>>,
    pub payment_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, token::mint = payment_mint, token::authority = issuer, token::token_program = payment_token_program)]
    pub issuer_payment: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, associated_token::mint = payment_mint, associated_token::authority = bond, associated_token::token_program = payment_token_program)]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    pub payment_token_program: Interface<'info, TokenInterface>,
}

/// Amortization on the date of a future coupon, funded in full in the same instruction,
/// so face value is never reduced without the money for it.
pub fn declare_partial_redemption_handler(
    ctx: Context<DeclarePartialRedemption>,
    coupon_action_id: u8,
    redeem_bps: u16,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let bond = &mut ctx.accounts.bond;
    bond.close_subscription_if_due(now);
    require!(bond.subscription_closed, PritokError::SubscriptionOpen);
    require!((bond.events_len as usize) < MAX_EVENTS, PritokError::TooManyEvents);
    require!(redeem_bps > 0 && redeem_bps < bond.factor_bps, PritokError::InvalidRedemption);
    let coupon_pos = bond.position(coupon_action_id).ok_or(PritokError::UnknownAction)?;
    let coupon = bond.events[coupon_pos];
    require!(coupon.kind == kind::COUPON, PritokError::WrongActionKind);
    require!(coupon.record_ts > now, PritokError::RecordDatePassed);

    let pos = bond.insert_partial_redemption(coupon_pos, redeem_bps);
    let required = bond.required(&bond.events[pos]).ok_or(PritokError::Overflow)?;

    token_interface::transfer_checked(
        CpiContext::new(
            ctx.accounts.payment_token_program.to_account_info(),
            token_interface::TransferChecked {
                from: ctx.accounts.issuer_payment.to_account_info(),
                mint: ctx.accounts.payment_mint.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.issuer.to_account_info(),
            },
        ),
        required,
        ctx.accounts.payment_mint.decimals,
    )?;

    let bond = &mut ctx.accounts.bond;
    bond.events[pos].funded = required;
    bond.events[pos].status = event_status::FUNDED;
    bond.reserved = bond.reserved.checked_add(required).ok_or(PritokError::Overflow)?;
    check_reserve(&mut ctx.accounts.vault, &ctx.accounts.bond)
}

// ---------------------------------------------------------------- redeem

#[derive(Accounts)]
#[instruction(maturity_action_id: u8, coupon_action_id: u8)]
pub struct Redeem<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(mut, has_one = payment_mint, has_one = bond_mint)]
    pub bond: Box<Account<'info, Bond>>,
    #[account(mut, seeds = [b"holder", bond.key().as_ref(), owner.key().as_ref()], bump = holder.bump)]
    pub holder: Box<Account<'info, Holder>>,
    #[account(
        init,
        payer = owner,
        space = 8 + Claim::INIT_SPACE,
        seeds = [b"claim", bond.key().as_ref(), &[maturity_action_id], owner.key().as_ref()],
        bump
    )]
    pub maturity_claim: Box<Account<'info, Claim>>,
    /// CHECK: receipt for the last coupon; created here if that coupon is paid now,
    /// otherwise left untouched so the coupon can still be claimed later.
    #[account(
        mut,
        seeds = [b"claim", bond.key().as_ref(), &[coupon_action_id], owner.key().as_ref()],
        bump
    )]
    pub coupon_claim: UncheckedAccount<'info>,
    /// CHECK: bond mint, bound to `bond` by has_one.
    #[account(mut)]
    pub bond_mint: UncheckedAccount<'info>,
    /// CHECK: holder's canonical bond ATA.
    #[account(mut)]
    pub owner_bond_ata: UncheckedAccount<'info>,
    pub payment_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, associated_token::mint = payment_mint, associated_token::authority = bond, associated_token::token_program = payment_token_program)]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, token::mint = payment_mint, token::authority = owner, token::token_program = payment_token_program)]
    pub owner_payment: Box<InterfaceAccount<'info, TokenAccount>>,
    pub bond_token_program: Program<'info, Token2022>,
    pub payment_token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

/// Pays principal and, when funded and not yet claimed, the last coupon. Shared by the
/// holder's `redeem` and the operator's `redeem_for`; the caller burns the bonds after.
#[allow(clippy::too_many_arguments)]
pub(crate) fn settle_maturity<'info>(
    bond: &mut Account<'info, Bond>,
    holder: &mut Account<'info, Holder>,
    maturity_claim: &mut Account<'info, Claim>,
    maturity_bump: u8,
    coupon_claim: &AccountInfo<'info>,
    coupon_bump: u8,
    maturity_action_id: u8,
    coupon_action_id: u8,
    payer: &AccountInfo<'info>,
    system_program: &AccountInfo<'info>,
    token_program: &Interface<'info, TokenInterface>,
    vault: &InterfaceAccount<'info, TokenAccount>,
    mint: &InterfaceAccount<'info, Mint>,
    to: &InterfaceAccount<'info, TokenAccount>,
    now: i64,
) -> Result<()> {
    let m_pos = bond.position(maturity_action_id).ok_or(PritokError::UnknownAction)?;
    let c_pos = bond.position(coupon_action_id).ok_or(PritokError::UnknownAction)?;
    let maturity = bond.events[m_pos];
    let coupon = bond.events[c_pos];
    require!(
        maturity.kind == kind::MATURITY && coupon.kind == kind::COUPON && coupon.pay_ts == maturity.pay_ts,
        PritokError::WrongActionKind
    );

    // Record-date balances are frozen before the burn changes the balance.
    holder.sync(bond, now);

    pay_event(bond, m_pos, holder, maturity_claim, maturity_bump, now, token_program, vault, mint, to)?;

    let coupon_unclaimed = coupon_claim.data_is_empty();
    if coupon_unclaimed && coupon.mode == mode::ONCHAIN && coupon.status == event_status::FUNDED {
        let bond_key = bond.key();
        let owner_key = holder.owner;
        let seeds: &[&[u8]] = &[b"claim", bond_key.as_ref(), &[coupon_action_id], owner_key.as_ref(), &[coupon_bump]];
        let space = 8 + Claim::INIT_SPACE;
        anchor_lang::system_program::create_account(
            CpiContext::new_with_signer(
                system_program.clone(),
                anchor_lang::system_program::CreateAccount { from: payer.clone(), to: coupon_claim.clone() },
                &[seeds],
            ),
            Rent::get()?.minimum_balance(space),
            space as u64,
            &crate::ID,
        )?;
        let mut receipt = Claim {
            bond: bond_key,
            owner: owner_key,
            action_id: coupon_action_id,
            units: 0,
            amount: 0,
            status: claim_status::PAID,
            bank_ref_hash: [0; 32],
            bump: coupon_bump,
        };
        pay_event(bond, c_pos, holder, &mut receipt, coupon_bump, now, token_program, vault, mint, to)?;
        let mut data = coupon_claim.try_borrow_mut_data()?;
        let mut writer: &mut [u8] = &mut data[..];
        receipt.try_serialize(&mut writer)?;
    }
    Ok(())
}

/// Burns the holder's bonds and pays principal. The last coupon is paid in the same
/// instruction when it is funded and not yet claimed; otherwise it stays claimable.
pub fn redeem_handler(mut ctx: Context<Redeem>, maturity_action_id: u8, coupon_action_id: u8) -> Result<()> {
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
        &a.owner.to_account_info(),
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
        CpiContext::new(
            token_program.clone(),
            token_2022::Burn { mint: mint.clone(), from: ata.clone(), authority: a.owner.to_account_info() },
        ),
        units,
    )?;
    token_ops::freeze(&token_program, &ata, &mint, &bond_info, signer)?;

    a.holder.balance = 0;
    a.bond.supply -= units;
    check_reserve(&mut a.vault, &a.bond)
}
