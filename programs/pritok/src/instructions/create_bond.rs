use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::token_2022::{
    self,
    spl_token_2022::{
        extension::{BaseStateWithExtensions, ExtensionType, StateWithExtensions},
        state::{AccountState, Mint as SplMint},
    },
    Token2022,
};
use anchor_spl::token_2022_extensions::default_account_state::{
    default_account_state_initialize, DefaultAccountStateInitialize,
};
use anchor_spl::token_interface::Mint;

use crate::errors::PritokError;
use crate::state::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct CreateBondParams {
    pub bond_id: u64,
    pub face_value: u64,
    pub coupon_bps: u16,
    pub period_secs: i64,
    pub start_ts: i64,
    pub record_offset_secs: i64,
    pub num_periods: u8,
    pub subscription_end_ts: i64,
}

#[derive(Accounts)]
#[instruction(params: CreateBondParams)]
pub struct CreateBond<'info> {
    #[account(mut)]
    pub issuer: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(
        init,
        payer = issuer,
        space = 8 + Bond::INIT_SPACE,
        seeds = [b"bond", issuer.key().as_ref(), &params.bond_id.to_le_bytes()],
        bump
    )]
    pub bond: Box<Account<'info, Bond>>,
    /// CHECK: created and initialized here as a Token-2022 mint.
    #[account(mut, seeds = [b"mint", bond.key().as_ref()], bump)]
    pub bond_mint: UncheckedAccount<'info>,
    pub payment_mint: InterfaceAccount<'info, Mint>,
    pub bond_token_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
}

/// Rejects Token-2022 payment mints whose transfers can deliver less than sent
/// or run foreign code.
fn check_payment_mint(mint: &AccountInfo) -> Result<()> {
    if *mint.owner != token_2022::ID {
        return Ok(());
    }
    let data = mint.try_borrow_data()?;
    let state = StateWithExtensions::<SplMint>::unpack(&data)?;
    for ext in state.get_extension_types()? {
        require!(
            !matches!(
                ext,
                ExtensionType::TransferFeeConfig
                    | ExtensionType::TransferHook
                    | ExtensionType::ConfidentialTransferMint
                    | ExtensionType::NonTransferable
            ),
            PritokError::PaymentMintExtensionNotAllowed
        );
    }
    Ok(())
}

pub fn create_bond_handler(ctx: Context<CreateBond>, params: CreateBondParams) -> Result<()> {
    let payment_mint = ctx.accounts.payment_mint.key();
    require!(
        ctx.accounts.config.is_payment_mint(&payment_mint),
        PritokError::PaymentMintNotAllowed
    );
    check_payment_mint(&ctx.accounts.payment_mint.to_account_info())?;

    require!(
        params.face_value > 0
            && params.period_secs > 0
            && params.record_offset_secs > 0
            && params.record_offset_secs < params.period_secs
            && params.num_periods >= 1
            && params.num_periods <= MAX_PERIODS,
        PritokError::InvalidBondParams
    );
    let first_record = params.start_ts + params.period_secs - params.record_offset_secs;
    require!(params.subscription_end_ts < first_record, PritokError::InvalidBondParams);

    let bond_key = ctx.accounts.bond.key();
    let bond = &mut ctx.accounts.bond;
    bond.issuer = ctx.accounts.issuer.key();
    bond.bond_id = params.bond_id;
    bond.bond_mint = ctx.accounts.bond_mint.key();
    bond.payment_mint = payment_mint;
    bond.face_value = params.face_value;
    bond.coupon_bps = params.coupon_bps;
    bond.period_secs = params.period_secs;
    bond.start_ts = params.start_ts;
    bond.record_offset_secs = params.record_offset_secs;
    bond.num_periods = params.num_periods;
    bond.factor_bps = BPS as u16;
    bond.subscription_end_ts = params.subscription_end_ts;
    bond.bump = ctx.bumps.bond;
    bond.mint_bump = ctx.bumps.bond_mint;
    bond.build_schedule();

    // Bond mint: decimals 0, every new token account starts frozen,
    // mint and freeze authority is the bond PDA.
    let space = ExtensionType::try_calculate_account_len::<SplMint>(&[
        ExtensionType::DefaultAccountState,
    ])?;
    let mint_seeds: &[&[u8]] = &[b"mint", bond_key.as_ref(), &[ctx.bumps.bond_mint]];
    system_program::create_account(
        CpiContext::new_with_signer(
            ctx.accounts.system_program.to_account_info(),
            system_program::CreateAccount {
                from: ctx.accounts.issuer.to_account_info(),
                to: ctx.accounts.bond_mint.to_account_info(),
            },
            &[mint_seeds],
        ),
        Rent::get()?.minimum_balance(space),
        space as u64,
        &token_2022::ID,
    )?;
    default_account_state_initialize(
        CpiContext::new(
            ctx.accounts.bond_token_program.to_account_info(),
            DefaultAccountStateInitialize {
                token_program_id: ctx.accounts.bond_token_program.to_account_info(),
                mint: ctx.accounts.bond_mint.to_account_info(),
            },
        ),
        &AccountState::Frozen,
    )?;
    token_2022::initialize_mint2(
        CpiContext::new(
            ctx.accounts.bond_token_program.to_account_info(),
            token_2022::InitializeMint2 {
                mint: ctx.accounts.bond_mint.to_account_info(),
            },
        ),
        0,
        &bond_key,
        Some(&bond_key),
    )?;
    Ok(())
}
