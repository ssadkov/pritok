//! Bond token accounts are always frozen. Every movement thaws, acts and re-freezes
//! inside one program instruction, so the registry cannot be bypassed.

use anchor_lang::prelude::*;
use anchor_spl::associated_token::{self, get_associated_token_address_with_program_id};
use anchor_spl::token_2022::{
    self,
    spl_token_2022::{
        extension::StateWithExtensions,
        state::{Account as SplAccount, AccountState},
    },
};

use crate::errors::PritokError;

pub fn require_canonical_ata(ata: &Pubkey, owner: &Pubkey, mint: &Pubkey) -> Result<()> {
    let expected = get_associated_token_address_with_program_id(owner, mint, &token_2022::ID);
    require_keys_eq!(*ata, expected, PritokError::NotCanonicalAta);
    Ok(())
}

pub fn create_ata_idempotent<'info>(
    payer: &AccountInfo<'info>,
    ata: &AccountInfo<'info>,
    owner: &AccountInfo<'info>,
    mint: &AccountInfo<'info>,
    system_program: &AccountInfo<'info>,
    token_program: &AccountInfo<'info>,
    ata_program: &AccountInfo<'info>,
) -> Result<()> {
    associated_token::create_idempotent(CpiContext::new(
        ata_program.clone(),
        associated_token::Create {
            payer: payer.clone(),
            associated_token: ata.clone(),
            authority: owner.clone(),
            mint: mint.clone(),
            system_program: system_program.clone(),
            token_program: token_program.clone(),
        },
    ))
}

fn is_frozen(account: &AccountInfo) -> Result<bool> {
    let data = account.try_borrow_data()?;
    let state = StateWithExtensions::<SplAccount>::unpack(&data)?;
    Ok(state.base.state == AccountState::Frozen)
}

pub fn thaw<'info>(
    token_program: &AccountInfo<'info>,
    account: &AccountInfo<'info>,
    mint: &AccountInfo<'info>,
    bond: &AccountInfo<'info>,
    signer_seeds: &[&[&[u8]]],
) -> Result<()> {
    if !is_frozen(account)? {
        return Ok(());
    }
    token_2022::thaw_account(CpiContext::new_with_signer(
        token_program.clone(),
        token_2022::ThawAccount {
            account: account.clone(),
            mint: mint.clone(),
            authority: bond.clone(),
        },
        signer_seeds,
    ))
}

pub fn freeze<'info>(
    token_program: &AccountInfo<'info>,
    account: &AccountInfo<'info>,
    mint: &AccountInfo<'info>,
    bond: &AccountInfo<'info>,
    signer_seeds: &[&[&[u8]]],
) -> Result<()> {
    token_2022::freeze_account(CpiContext::new_with_signer(
        token_program.clone(),
        token_2022::FreezeAccount {
            account: account.clone(),
            mint: mint.clone(),
            authority: bond.clone(),
        },
        signer_seeds,
    ))
}
