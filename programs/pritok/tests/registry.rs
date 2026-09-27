//! Registry integration tests on LiteSVM.
//! Test numbers follow docs/PLAN.md §5.3 "Обязательные тесты".

use anchor_lang::{
    prelude::{Clock, Pubkey},
    solana_program::{instruction::Instruction, system_instruction},
    AccountDeserialize, InstructionData, ToAccountMetas,
};
use anchor_spl::{
    associated_token::{
        get_associated_token_address_with_program_id,
        spl_associated_token_account::instruction::create_associated_token_account,
    },
    token::spl_token,
    token_2022::spl_token_2022,
};
use anchor_lang::solana_program::program_pack::Pack;
use litesvm::LiteSVM;
use pritok::state::{Bond, Holder};
use solana_keypair::Keypair;
use solana_signer::Signer;
use solana_transaction::Transaction;

const T0: i64 = 1_000_000;
const PERIOD: i64 = 600;
const RECORD_OFFSET: i64 = 30;
const SUB_END: i64 = T0 + 100;
const FACE: u64 = 10_000_000; // 100 000.00 tKZT
const BOND_ID: u64 = 1;
const ISSUER_TKZT: u64 = 1_000_000_000_000_000;
const COUPON: u64 = 800_000; // 8 000.00 per bond

// Action ids created by create_bond: coupons 0..=3, maturity 4; the first ad-hoc action gets 5.
const C1: u8 = 0;
const C2: u8 = 1;
const C3: u8 = 2;
const C4: u8 = 3;
const MAT: u8 = 4;
const PR: u8 = 5;

struct Env {
    svm: LiteSVM,
    operator: Keypair,
    issuer: Keypair,
    tkzt: Pubkey,
    config: Pubkey,
    bond: Pubkey,
    bond_mint: Pubkey,
}

fn program_so() -> String {
    format!("{}/../../target/deploy/pritok.so", env!("CARGO_MANIFEST_DIR"))
}

fn send(svm: &mut LiteSVM, ixs: &[Instruction], payer: &Keypair, extra: &[&Keypair]) -> Result<(), String> {
    let mut signers: Vec<&Keypair> = vec![payer];
    signers.extend_from_slice(extra);
    let tx = Transaction::new_signed_with_payer(ixs, Some(&payer.pubkey()), &signers, svm.latest_blockhash());
    let res = svm.send_transaction(tx).map(|_| ()).map_err(|e| format!("{:?}\n{}", e.err, e.meta.logs.join("\n")));
    svm.expire_blockhash();
    res
}

fn warp(svm: &mut LiteSVM, ts: i64) {
    let mut clock = svm.get_sysvar::<Clock>();
    clock.unix_timestamp = ts;
    svm.set_sysvar(&clock);
}

fn holder_pda(bond: &Pubkey, owner: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[b"holder", bond.as_ref(), owner.as_ref()], &pritok::ID).0
}

fn bond_ata(owner: &Pubkey, mint: &Pubkey) -> Pubkey {
    get_associated_token_address_with_program_id(owner, mint, &spl_token_2022::ID)
}

fn tkzt_ata(owner: &Pubkey, mint: &Pubkey) -> Pubkey {
    get_associated_token_address_with_program_id(owner, mint, &spl_token::ID)
}

fn read<T: AccountDeserialize>(svm: &LiteSVM, key: &Pubkey) -> T {
    let acc = svm.get_account(key).expect("account missing");
    T::try_deserialize(&mut acc.data.as_slice()).expect("deserialize")
}

fn funded_wallet(svm: &mut LiteSVM) -> Keypair {
    let kp = Keypair::new();
    svm.airdrop(&kp.pubkey(), 100_000_000_000).unwrap();
    kp
}

fn setup() -> Env {
    let mut svm = LiteSVM::new();
    svm.add_program_from_file(pritok::ID, program_so()).expect("build the program first: anchor build");
    warp(&mut svm, T0);

    let operator = funded_wallet(&mut svm);
    let issuer = funded_wallet(&mut svm);

    // tKZT: classic SPL token, 2 decimals, operator is the mint authority (faucet).
    let tkzt_kp = Keypair::new();
    let tkzt = tkzt_kp.pubkey();
    let rent = svm.minimum_balance_for_rent_exemption(82);
    send(
        &mut svm,
        &[
            system_instruction::create_account(&operator.pubkey(), &tkzt, rent, 82, &spl_token::ID),
            spl_token::instruction::initialize_mint2(&spl_token::ID, &tkzt, &operator.pubkey(), None, 2).unwrap(),
            create_associated_token_account(&operator.pubkey(), &issuer.pubkey(), &tkzt, &spl_token::ID),
            spl_token::instruction::mint_to(&spl_token::ID, &tkzt, &tkzt_ata(&issuer.pubkey(), &tkzt), &operator.pubkey(), &[], ISSUER_TKZT).unwrap(),
            create_associated_token_account(&operator.pubkey(), &operator.pubkey(), &tkzt, &spl_token::ID),
        ],
        &operator,
        &[&tkzt_kp],
    )
    .unwrap();

    let config = Pubkey::find_program_address(&[b"config"], &pritok::ID).0;
    send(
        &mut svm,
        &[Instruction {
            program_id: pritok::ID,
            accounts: pritok::accounts::InitConfig {
                operator: operator.pubkey(),
                config,
                system_program: anchor_lang::system_program::ID,
            }
            .to_account_metas(None),
            data: pritok::instruction::InitConfig { payment_mints: vec![tkzt] }.data(),
        }],
        &operator,
        &[],
    )
    .unwrap();

    let bond = Pubkey::find_program_address(
        &[b"bond", issuer.pubkey().as_ref(), &BOND_ID.to_le_bytes()],
        &pritok::ID,
    )
    .0;
    let bond_mint = Pubkey::find_program_address(&[b"mint", bond.as_ref()], &pritok::ID).0;
    send(
        &mut svm,
        &[Instruction {
            program_id: pritok::ID,
            accounts: pritok::accounts::CreateBond {
                issuer: issuer.pubkey(),
                config,
                bond,
                bond_mint,
                payment_mint: tkzt,
                vault: tkzt_ata(&bond, &tkzt),
                bond_token_program: spl_token_2022::ID,
                payment_token_program: spl_token::ID,
                associated_token_program: anchor_spl::associated_token::ID,
                system_program: anchor_lang::system_program::ID,
            }
            .to_account_metas(None),
            data: pritok::instruction::CreateBond {
                params: pritok::CreateBondParams {
                    bond_id: BOND_ID,
                    face_value: FACE,
                    coupon_bps: 1_600,
                    period_secs: PERIOD,
                    start_ts: T0,
                    record_offset_secs: RECORD_OFFSET,
                    num_periods: 4,
                    subscription_end_ts: SUB_END,
                },
            }
            .data(),
        }],
        &issuer,
        &[],
    )
    .unwrap();

    Env { svm, operator, issuer, tkzt, config, bond, bond_mint }
}

impl Env {
    /// New allowed investor with enough tKZT to subscribe.
    fn investor(&mut self, tkzt_amount: u64) -> Keypair {
        let kp = funded_wallet(&mut self.svm);
        let ata = tkzt_ata(&kp.pubkey(), &self.tkzt);
        let op = self.operator.insecure_clone();
        send(
            &mut self.svm,
            &[
                create_associated_token_account(&op.pubkey(), &kp.pubkey(), &self.tkzt, &spl_token::ID),
                spl_token::instruction::mint_to(&spl_token::ID, &self.tkzt, &ata, &op.pubkey(), &[], tkzt_amount).unwrap(),
            ],
            &op,
            &[],
        )
        .unwrap();
        self.allow(&kp.pubkey());
        kp
    }

    fn allow(&mut self, owner: &Pubkey) {
        let op = self.operator.insecure_clone();
        let ix = Instruction {
            program_id: pritok::ID,
            accounts: pritok::accounts::AllowHolder {
                operator: op.pubkey(),
                config: self.config,
                bond: self.bond,
                owner: *owner,
                holder: holder_pda(&self.bond, owner),
                system_program: anchor_lang::system_program::ID,
            }
            .to_account_metas(None),
            data: pritok::instruction::AllowHolder {}.data(),
        };
        send(&mut self.svm, &[ix], &op, &[]).unwrap();
    }

    fn subscribe(&mut self, investor: &Keypair, units: u64) -> Result<(), String> {
        let ix = Instruction {
            program_id: pritok::ID,
            accounts: pritok::accounts::Subscribe {
                investor: investor.pubkey(),
                config: self.config,
                bond: self.bond,
                issuer: self.issuer.pubkey(),
                holder: holder_pda(&self.bond, &investor.pubkey()),
                bond_mint: self.bond_mint,
                investor_bond_ata: bond_ata(&investor.pubkey(), &self.bond_mint),
                payment_mint: self.tkzt,
                investor_payment: tkzt_ata(&investor.pubkey(), &self.tkzt),
                issuer_payment: tkzt_ata(&self.issuer.pubkey(), &self.tkzt),
                bond_token_program: spl_token_2022::ID,
                payment_token_program: spl_token::ID,
                associated_token_program: anchor_spl::associated_token::ID,
                system_program: anchor_lang::system_program::ID,
            }
            .to_account_metas(None),
            data: pritok::instruction::Subscribe { units }.data(),
        };
        send(&mut self.svm, &[ix], investor, &[])
    }

    fn transfer(&mut self, from: &Keypair, to: &Pubkey, units: u64) -> Result<(), String> {
        let ix = Instruction {
            program_id: pritok::ID,
            accounts: pritok::accounts::TransferBond {
                from: from.pubkey(),
                to: *to,
                config: self.config,
                bond: self.bond,
                from_holder: holder_pda(&self.bond, &from.pubkey()),
                to_holder: holder_pda(&self.bond, to),
                bond_mint: self.bond_mint,
                from_ata: bond_ata(&from.pubkey(), &self.bond_mint),
                to_ata: bond_ata(to, &self.bond_mint),
                bond_token_program: spl_token_2022::ID,
                associated_token_program: anchor_spl::associated_token::ID,
                system_program: anchor_lang::system_program::ID,
            }
            .to_account_metas(None),
            data: pritok::instruction::TransferBond { units }.data(),
        };
        send(&mut self.svm, &[ix], from, &[])
    }

    fn close_subscription(&mut self) -> Result<(), String> {
        let ix = Instruction {
            program_id: pritok::ID,
            accounts: pritok::accounts::CloseSubscription { bond: self.bond }.to_account_metas(None),
            data: pritok::instruction::CloseSubscription {}.data(),
        };
        let op = self.operator.insecure_clone();
        send(&mut self.svm, &[ix], &op, &[])
    }

    fn vault(&self) -> Pubkey {
        tkzt_ata(&self.bond, &self.tkzt)
    }

    fn fund(&mut self, action_id: u8, amount: u64) -> Result<(), String> {
        let issuer = self.issuer.insecure_clone();
        let ix = Instruction {
            program_id: pritok::ID,
            accounts: pritok::accounts::FundAction {
                issuer: issuer.pubkey(),
                bond: self.bond,
                payment_mint: self.tkzt,
                issuer_payment: tkzt_ata(&issuer.pubkey(), &self.tkzt),
                vault: self.vault(),
                payment_token_program: spl_token::ID,
            }
            .to_account_metas(None),
            data: pritok::instruction::FundAction { action_id, amount }.data(),
        };
        send(&mut self.svm, &[ix], &issuer, &[])
    }

    fn mark_default(&mut self, action_id: u8) -> Result<(), String> {
        let ix = Instruction {
            program_id: pritok::ID,
            accounts: pritok::accounts::MarkDefault { bond: self.bond }.to_account_metas(None),
            data: pritok::instruction::MarkDefault { action_id }.data(),
        };
        let op = self.operator.insecure_clone();
        send(&mut self.svm, &[ix], &op, &[])
    }

    fn claim_pda(&self, action_id: u8, owner: &Pubkey) -> Pubkey {
        Pubkey::find_program_address(&[b"claim", self.bond.as_ref(), &[action_id], owner.as_ref()], &pritok::ID).0
    }

    fn claim(&mut self, owner: &Keypair, action_id: u8) -> Result<(), String> {
        let ix = Instruction {
            program_id: pritok::ID,
            accounts: pritok::accounts::ClaimPayout {
                owner: owner.pubkey(),
                bond: self.bond,
                holder: holder_pda(&self.bond, &owner.pubkey()),
                claim: self.claim_pda(action_id, &owner.pubkey()),
                payment_mint: self.tkzt,
                vault: self.vault(),
                owner_payment: tkzt_ata(&owner.pubkey(), &self.tkzt),
                payment_token_program: spl_token::ID,
                system_program: anchor_lang::system_program::ID,
            }
            .to_account_metas(None),
            data: pritok::instruction::Claim { action_id }.data(),
        };
        send(&mut self.svm, &[ix], owner, &[])
    }

    fn declare_pr(&mut self, coupon_action_id: u8, redeem_bps: u16) -> Result<(), String> {
        let issuer = self.issuer.insecure_clone();
        let ix = Instruction {
            program_id: pritok::ID,
            accounts: pritok::accounts::DeclarePartialRedemption {
                issuer: issuer.pubkey(),
                bond: self.bond,
                payment_mint: self.tkzt,
                issuer_payment: tkzt_ata(&issuer.pubkey(), &self.tkzt),
                vault: self.vault(),
                payment_token_program: spl_token::ID,
            }
            .to_account_metas(None),
            data: pritok::instruction::DeclarePartialRedemption { coupon_action_id, redeem_bps }.data(),
        };
        send(&mut self.svm, &[ix], &issuer, &[])
    }

    fn redeem(&mut self, owner: &Keypair) -> Result<(), String> {
        let ix = Instruction {
            program_id: pritok::ID,
            accounts: pritok::accounts::Redeem {
                owner: owner.pubkey(),
                bond: self.bond,
                holder: holder_pda(&self.bond, &owner.pubkey()),
                maturity_claim: self.claim_pda(MAT, &owner.pubkey()),
                coupon_claim: self.claim_pda(C4, &owner.pubkey()),
                bond_mint: self.bond_mint,
                owner_bond_ata: bond_ata(&owner.pubkey(), &self.bond_mint),
                payment_mint: self.tkzt,
                vault: self.vault(),
                owner_payment: tkzt_ata(&owner.pubkey(), &self.tkzt),
                bond_token_program: spl_token_2022::ID,
                payment_token_program: spl_token::ID,
                system_program: anchor_lang::system_program::ID,
            }
            .to_account_metas(None),
            data: pritok::instruction::Redeem { maturity_action_id: MAT, coupon_action_id: C4 }.data(),
        };
        send(&mut self.svm, &[ix], owner, &[])
    }


    fn claim_to_bank(&mut self, authority: &Keypair, owner: &Pubkey, action_id: u8) -> Result<(), String> {
        let ix = Instruction {
            program_id: pritok::ID,
            accounts: pritok::accounts::ClaimToBank {
                authority: authority.pubkey(),
                owner: *owner,
                config: self.config,
                bond: self.bond,
                holder: holder_pda(&self.bond, owner),
                claim: self.claim_pda(action_id, owner),
                payment_mint: self.tkzt,
                vault: self.vault(),
                agent_payment: tkzt_ata(&self.operator.pubkey(), &self.tkzt),
                payment_token_program: spl_token::ID,
                system_program: anchor_lang::system_program::ID,
            }
            .to_account_metas(None),
            data: pritok::instruction::ClaimToBank { action_id }.data(),
        };
        send(&mut self.svm, &[ix], authority, &[])
    }

    fn confirm_bank(&mut self, signer: &Keypair, owner: &Pubkey, action_id: u8, bank_ref_hash: [u8; 32]) -> Result<(), String> {
        let ix = Instruction {
            program_id: pritok::ID,
            accounts: pritok::accounts::ConfirmBankPayment {
                operator: signer.pubkey(),
                config: self.config,
                bond: self.bond,
                owner: *owner,
                claim: self.claim_pda(action_id, owner),
            }
            .to_account_metas(None),
            data: pritok::instruction::ConfirmBankPayment { action_id, bank_ref_hash }.data(),
        };
        send(&mut self.svm, &[ix], signer, &[])
    }

    fn revoke(&mut self, owner: &Pubkey) -> Result<(), String> {
        let op = self.operator.insecure_clone();
        let ix = Instruction {
            program_id: pritok::ID,
            accounts: pritok::accounts::RevokeHolder { operator: op.pubkey(), config: self.config, holder: holder_pda(&self.bond, owner) }
                .to_account_metas(None),
            data: pritok::instruction::RevokeHolder {}.data(),
        };
        send(&mut self.svm, &[ix], &op, &[])
    }

    fn set_paused(&mut self, signer: &Keypair, paused: bool) -> Result<(), String> {
        let ix = Instruction {
            program_id: pritok::ID,
            accounts: pritok::accounts::SetPaused { operator: signer.pubkey(), config: self.config }.to_account_metas(None),
            data: pritok::instruction::SetPaused { paused }.data(),
        };
        send(&mut self.svm, &[ix], signer, &[])
    }

    fn receipt(&self, action_id: u8, owner: &Pubkey) -> pritok::state::Claim {
        read(&self.svm, &self.claim_pda(action_id, owner))
    }

    fn tkzt_balance(&self, owner: &Pubkey) -> u64 {
        let acc = self.svm.get_account(&tkzt_ata(owner, &self.tkzt)).unwrap();
        spl_token::state::Account::unpack(&acc.data).unwrap().amount
    }

    fn bond_state(&self) -> Bond {
        read(&self.svm, &self.bond)
    }

    fn event(&self, action_id: u8) -> pritok::state::Event {
        let b = self.bond_state();
        b.events[b.position(action_id).unwrap()]
    }

    /// Vault balance must equal reserved obligations (no rounding dust with these numbers).
    fn assert_reserve(&self) {
        let b = self.bond_state();
        assert_eq!(self.tkzt_balance(&self.bond), b.reserved, "vault == reserved");
    }

    /// Standard placement: A 300, B 200, F 500, subscription closed.
    fn placed(&mut self) -> (Keypair, Keypair, Keypair) {
        let a = self.investor(1_000 * FACE);
        let b = self.investor(1_000 * FACE);
        let f = self.investor(1_000 * FACE);
        self.subscribe(&a, 300).unwrap();
        self.subscribe(&b, 200).unwrap();
        self.subscribe(&f, 500).unwrap();
        warp(&mut self.svm, SUB_END);
        self.close_subscription().unwrap();
        (a, b, f)
    }

    fn units_at(&self, owner: &Pubkey, pos: usize, now: i64) -> Option<u64> {
        let bond: Bond = read(&self.svm, &self.bond);
        let holder: Holder = read(&self.svm, &holder_pda(&self.bond, owner));
        holder.units_at(&bond, pos, now)
    }

    fn token_balance(&self, owner: &Pubkey) -> u64 {
        let acc = self.svm.get_account(&bond_ata(owner, &self.bond_mint)).unwrap();
        let state = spl_token_2022::extension::StateWithExtensions::<spl_token_2022::state::Account>::unpack(&acc.data).unwrap();
        state.base.amount
    }
}

fn record_ts(env: &Env, pos: usize) -> i64 {
    let bond: Bond = read(&env.svm, &env.bond);
    bond.events[pos].record_ts
}

/// Test 4: holders cannot move, burn, delegate or re-own frozen bond tokens directly.
#[test]
fn t04_direct_token_2022_operations_fail() {
    let mut env = setup();
    let a = env.investor(1_000 * FACE);
    let b = env.investor(1_000 * FACE);
    env.subscribe(&a, 300).unwrap();
    env.subscribe(&b, 200).unwrap();

    let a_ata = bond_ata(&a.pubkey(), &env.bond_mint);
    let b_ata = bond_ata(&b.pubkey(), &env.bond_mint);
    let t22 = spl_token_2022::ID;
    let mint = env.bond_mint;
    let thief = Keypair::new();
    // Expected Token-2022 errors: AccountFrozen = 0x11, OwnerMismatch = 0x4,
    // NonNativeHasBalance = 0xb. Checking the code proves the failure is the
    // freeze, not a signing or account-setup mistake in the test.
    let attempts: Vec<(&str, Instruction, &str)> = vec![
        ("transfer_checked", spl_token_2022::instruction::transfer_checked(&t22, &a_ata, &mint, &b_ata, &a.pubkey(), &[], 1, 0).unwrap(), "0x11"),
        ("burn_checked", spl_token_2022::instruction::burn_checked(&t22, &a_ata, &mint, &a.pubkey(), &[], 1, 0).unwrap(), "0x11"),
        ("approve_checked", spl_token_2022::instruction::approve_checked(&t22, &a_ata, &mint, &thief.pubkey(), &a.pubkey(), &[], 1, 0).unwrap(), "0x11"),
        (
            "set_authority(owner)",
            spl_token_2022::instruction::set_authority(&t22, &a_ata, Some(&thief.pubkey()), spl_token_2022::instruction::AuthorityType::AccountOwner, &a.pubkey(), &[]).unwrap(),
            "0x11",
        ),
        ("thaw_account by holder", spl_token_2022::instruction::thaw_account(&t22, &a_ata, &mint, &a.pubkey(), &[]).unwrap(), "0x4"),
        ("close_account(non-empty)", spl_token_2022::instruction::close_account(&t22, &a_ata, &a.pubkey(), &a.pubkey(), &[]).unwrap(), "0xb"),
    ];
    for (name, ix, code) in attempts {
        let err = send(&mut env.svm, &[ix], &a, &[]).expect_err(name);
        assert!(err.contains(&format!("custom program error: {code}")), "{name}: expected {code}, got\n{err}");
    }
    assert_eq!(env.token_balance(&a.pubkey()), 300);
    assert_eq!(env.token_balance(&b.pubkey()), 200);
}

/// Test 1: transfer before the record date moves the coupon, after it does not.
#[test]
fn t01_transfer_before_and_after_record_date() {
    let mut env = setup();
    let a = env.investor(1_000 * FACE);
    let b = env.investor(1_000 * FACE);
    let f = env.investor(1_000 * FACE);
    env.subscribe(&a, 300).unwrap();
    env.subscribe(&b, 200).unwrap();
    env.subscribe(&f, 500).unwrap();

    warp(&mut env.svm, SUB_END);
    env.close_subscription().unwrap();
    let bond: Bond = read(&env.svm, &env.bond);
    assert_eq!(bond.issued_units, 1_000);
    assert!(env.subscribe(&a, 1).is_err(), "subscription is closed");

    let r1 = record_ts(&env, 0);
    warp(&mut env.svm, r1 - 5);
    env.transfer(&a, &b.pubkey(), 10).unwrap();
    warp(&mut env.svm, r1 + 5);
    env.transfer(&b, &f.pubkey(), 10).unwrap();

    let now = r1 + 5;
    assert_eq!(env.units_at(&a.pubkey(), 0, now), Some(290));
    assert_eq!(env.units_at(&b.pubkey(), 0, now), Some(210));
    assert_eq!(env.units_at(&f.pubkey(), 0, now), Some(500));
    assert_eq!(env.units_at(&b.pubkey(), 1, now), None, "coupon 2 not recorded yet");

    let r2 = record_ts(&env, 1);
    assert_eq!(env.units_at(&b.pubkey(), 1, r2), Some(200));
    assert_eq!(env.units_at(&f.pubkey(), 1, r2), Some(510));

    assert_eq!(env.token_balance(&a.pubkey()), 290);
    assert_eq!(env.token_balance(&b.pubkey()), 200);
    assert_eq!(env.token_balance(&f.pubkey()), 510);
}

/// Test 5: transfers are closed from the maturity record date.
#[test]
fn t05_transfer_after_maturity_record_date_fails() {
    let mut env = setup();
    let a = env.investor(1_000 * FACE);
    let b = env.investor(1_000 * FACE);
    env.subscribe(&a, 10).unwrap();
    env.subscribe(&b, 10).unwrap();

    let maturity_record = record_ts(&env, 4);
    warp(&mut env.svm, maturity_record - 1);
    env.transfer(&a, &b.pubkey(), 1).unwrap();
    warp(&mut env.svm, maturity_record);
    let err = env.transfer(&a, &b.pubkey(), 1).unwrap_err();
    assert!(err.contains("TransfersClosed"), "{err}");
}

/// Test 10: a holder closes the empty frozen ATA; the next incoming transfer
/// recreates it frozen and the registry keeps the history.
#[test]
fn t10_closed_empty_ata_is_recreated() {
    let mut env = setup();
    let a = env.investor(1_000 * FACE);
    let d = env.investor(0);
    env.subscribe(&a, 50).unwrap();

    env.transfer(&a, &d.pubkey(), 5).unwrap();
    env.transfer(&d, &a.pubkey(), 5).unwrap();
    let d_ata = bond_ata(&d.pubkey(), &env.bond_mint);
    send(
        &mut env.svm,
        &[spl_token_2022::instruction::close_account(&spl_token_2022::ID, &d_ata, &d.pubkey(), &d.pubkey(), &[]).unwrap()],
        &d,
        &[],
    )
    .expect("closing an empty frozen account is allowed by Token-2022");
    assert!(env.svm.get_account(&d_ata).map_or(true, |acc| acc.lamports == 0));

    env.transfer(&a, &d.pubkey(), 7).unwrap();
    assert_eq!(env.token_balance(&d.pubkey()), 7);
    let holder: Holder = read(&env.svm, &holder_pda(&env.bond, &d.pubkey()));
    assert_eq!(holder.balance, 7);
}

/// Receiving requires admission.
#[test]
fn transfer_to_unknown_wallet_fails() {
    let mut env = setup();
    let a = env.investor(1_000 * FACE);
    env.subscribe(&a, 10).unwrap();
    let stranger = Keypair::new();
    assert!(env.transfer(&a, &stranger.pubkey(), 1).is_err());
}

fn pay_ts(env: &Env, action_id: u8) -> i64 {
    env.event(action_id).pay_ts
}

/// Coupon payout, test 6 (double claim) and test 11 (vault reserve).
#[test]
fn t06_coupon_claim_and_no_double_payment() {
    let mut env = setup();
    let (a, b, f) = env.placed();
    let required = COUPON * 1_000;

    assert!(env.fund(C1, required + 1).unwrap_err().contains("OverFunding"));
    env.fund(C1, required).unwrap();
    env.assert_reserve();
    let err = env.claim(&a, C1).unwrap_err();
    assert!(err.contains("NotPayable"), "{err}");

    let t = pay_ts(&env, C1);
    warp(&mut env.svm, t);
    let before = env.tkzt_balance(&a.pubkey());
    env.claim(&a, C1).unwrap();
    env.claim(&b, C1).unwrap();
    env.claim(&f, C1).unwrap();
    assert_eq!(env.tkzt_balance(&a.pubkey()) - before, 300 * COUPON);
    assert!(env.claim(&a, C1).is_err(), "double claim must fail");

    assert_eq!(env.event(C1).claimed, required);
    assert_eq!(env.bond_state().reserved, 0);
    env.assert_reserve();
    let err = env.claim(&a, MAT).unwrap_err();
    assert!(err.contains("WrongActionKind"), "{err}");
}

/// Default is public and never forgiven: claims open only after the full debt is paid.
#[test]
fn default_then_cure() {
    let mut env = setup();
    let (a, _b, _f) = env.placed();
    let required = COUPON * 1_000;

    env.fund(C1, required * 3 / 4).unwrap();
    let t = pay_ts(&env, C1);
    warp(&mut env.svm, t);
    assert!(env.claim(&a, C1).unwrap_err().contains("NotFunded"));
    env.mark_default(C1).unwrap();
    assert_eq!(env.event(C1).status, pritok::state::event_status::DEFAULTED);
    assert!(env.claim(&a, C1).unwrap_err().contains("NotFunded"));

    env.fund(C1, required / 4).unwrap();
    assert_eq!(env.event(C1).status, pritok::state::event_status::FUNDED);
    assert!(env.mark_default(C1).is_err(), "funded event cannot default");
    env.claim(&a, C1).unwrap();
    env.assert_reserve();
}

/// Tests 3 and 8: amortization on coupon 2's date, declared after coupon 1's record date,
/// with a transfer between the two record dates.
#[test]
fn t08_partial_redemption_flow() {
    let mut env = setup();
    let (a, b, _f) = env.placed();

    let r1 = record_ts(&env, 0);
    warp(&mut env.svm, r1 + 1);
    assert!(env.declare_pr(C1, 2_000).unwrap_err().contains("RecordDatePassed"));
    let issuer_before = env.tkzt_balance(&env.issuer.pubkey());
    env.declare_pr(C2, 2_000).unwrap();
    assert_eq!(issuer_before - env.tkzt_balance(&env.issuer.pubkey()), 2_000_000 * 1_000, "funded at declaration");
    env.assert_reserve();

    assert_eq!(env.bond_state().position(PR), Some(2));
    assert_eq!(env.event(C2).amount_per_unit, COUPON);
    assert_eq!(env.event(C3).amount_per_unit, 640_000);
    assert_eq!(env.event(C4).amount_per_unit, 640_000);
    assert_eq!(env.event(MAT).amount_per_unit, 8_000_000);

    env.transfer(&a, &b.pubkey(), 50).unwrap(); // between record 1 and record 2

    let t = pay_ts(&env, C2);
    warp(&mut env.svm, t);
    env.fund(C1, COUPON * 1_000).unwrap();
    env.fund(C2, COUPON * 1_000).unwrap();
    let before = env.tkzt_balance(&a.pubkey());
    env.claim(&a, C1).unwrap();
    env.claim(&a, C2).unwrap();
    env.claim(&a, PR).unwrap();
    assert_eq!(
        env.tkzt_balance(&a.pubkey()) - before,
        300 * COUPON + 250 * COUPON + 250 * 2_000_000
    );
    let before_b = env.tkzt_balance(&b.pubkey());
    env.claim(&b, PR).unwrap();
    assert_eq!(env.tkzt_balance(&b.pubkey()) - before_b, 250 * 2_000_000);
    env.assert_reserve();
}

/// Test 7: some holders redeem before the last coupon is funded; the coupon stays
/// claimable after their bonds are burned, and required amounts do not shrink.
#[test]
fn t07_redeem_then_last_coupon() {
    let mut env = setup();
    let (a, b, f) = env.placed();

    let t = pay_ts(&env, MAT);
    warp(&mut env.svm, t);
    assert!(env.redeem(&a).unwrap_err().contains("NotFunded"));
    env.fund(MAT, FACE * 1_000).unwrap();

    // F redeems while coupon 4 is unfunded: principal only.
    let f0 = env.tkzt_balance(&f.pubkey());
    env.redeem(&f).unwrap();
    assert_eq!(env.tkzt_balance(&f.pubkey()) - f0, 500 * FACE);
    assert_eq!(env.token_balance(&f.pubkey()), 0);
    assert_eq!(env.bond_state().supply, 500);
    assert!(env.redeem(&f).is_err(), "second redeem must fail");

    env.fund(C4, COUPON * 1_000).unwrap();
    assert_eq!(env.event(C4).funded, COUPON * 1_000, "required still counts burned bonds");

    // A redeems: principal and coupon 4 together.
    let a0 = env.tkzt_balance(&a.pubkey());
    env.redeem(&a).unwrap();
    assert_eq!(env.tkzt_balance(&a.pubkey()) - a0, 300 * FACE + 300 * COUPON);
    assert!(env.claim(&a, C4).is_err(), "coupon 4 already paid in redeem");

    // B claims coupon 4 first, then redeems principal only.
    env.claim(&b, C4).unwrap();
    let b0 = env.tkzt_balance(&b.pubkey());
    env.redeem(&b).unwrap();
    assert_eq!(env.tkzt_balance(&b.pubkey()) - b0, 200 * FACE);

    // F claims coupon 4 after the burn, from the record-date balance.
    let f1 = env.tkzt_balance(&f.pubkey());
    env.claim(&f, C4).unwrap();
    assert_eq!(env.tkzt_balance(&f.pubkey()) - f1, 500 * COUPON);

    let bond = env.bond_state();
    assert_eq!(bond.supply, 0);
    assert_eq!(env.event(MAT).claimed, FACE * 1_000);
    assert_eq!(env.event(C4).claimed, COUPON * 1_000);
    assert_eq!(bond.reserved, 0);
    env.assert_reserve();
}

/// Bank off-ramp: the holder's share leaves the vault for the paying agent; the agent
/// attests the bank transfer with a payment-reference hash.
#[test]
fn bank_payout_and_confirmation() {
    use pritok::state::claim_status;
    let mut env = setup();
    let (a, b, f) = env.placed();
    env.fund(C1, COUPON * 1_000).unwrap();
    let t = pay_ts(&env, C1);
    warp(&mut env.svm, t);

    let op = env.operator.insecure_clone();
    let agent = op.pubkey();
    let issuer = env.issuer.insecure_clone();

    env.claim(&a, C1).unwrap(); // wallet

    let agent0 = env.tkzt_balance(&agent);
    let b0 = env.tkzt_balance(&b.pubkey());
    env.claim_to_bank(&b, &b.pubkey(), C1).unwrap(); // holder chooses the bank
    assert_eq!(env.tkzt_balance(&agent) - agent0, 200 * COUPON, "share moved to the paying agent");
    assert_eq!(env.tkzt_balance(&b.pubkey()), b0, "nothing to the wallet");
    assert_eq!(env.receipt(C1, &b.pubkey()).status, claim_status::BANK_REQUESTED);
    assert!(env.claim(&b, C1).is_err(), "a payout goes to the wallet or the bank, once");

    let err = env.claim_to_bank(&issuer, &f.pubkey(), C1).unwrap_err();
    assert!(err.contains("NotHolderOrOperator"), "{err}");
    env.claim_to_bank(&op, &f.pubkey(), C1).unwrap(); // registrar acts for a holder without a wallet

    let hash = [7u8; 32];
    let err = env.confirm_bank(&issuer, &b.pubkey(), C1, hash).unwrap_err();
    assert!(err.contains("NotOperator"), "{err}");
    let err = env.confirm_bank(&op, &b.pubkey(), C1, [0; 32]).unwrap_err();
    assert!(err.contains("EmptyBankRef"), "{err}");
    env.confirm_bank(&op, &b.pubkey(), C1, hash).unwrap();
    let r = env.receipt(C1, &b.pubkey());
    assert_eq!(r.status, claim_status::BANK_CONFIRMED);
    assert_eq!(r.bank_ref_hash, hash);
    let err = env.confirm_bank(&op, &b.pubkey(), C1, hash).unwrap_err();
    assert!(err.contains("NotBankRequest"), "{err}");
    let err = env.confirm_bank(&op, &a.pubkey(), C1, hash).unwrap_err();
    assert!(err.contains("NotBankRequest"), "wallet payouts cannot be bank-confirmed: {err}");

    assert_eq!(env.event(C1).claimed, COUPON * 1_000);
    assert_eq!(env.bond_state().reserved, 0);
    env.assert_reserve();
}

/// Revocation blocks receiving bonds, pause blocks movements; neither cancels payouts.
#[test]
fn revoke_and_pause_keep_existing_rights() {
    let mut env = setup();
    let (a, b, f) = env.placed();
    let op = env.operator.insecure_clone();
    let issuer = env.issuer.insecure_clone();

    env.revoke(&b.pubkey()).unwrap();
    let err = env.transfer(&a, &b.pubkey(), 1).unwrap_err();
    assert!(err.contains("HolderNotAllowed"), "{err}");
    env.transfer(&b, &a.pubkey(), 10).unwrap(); // a revoked holder can still sell out

    assert!(env.set_paused(&issuer, true).unwrap_err().contains("NotOperator"));
    env.set_paused(&op, true).unwrap();
    let err = env.transfer(&a, &f.pubkey(), 1).unwrap_err();
    assert!(err.contains("Paused"), "{err}");

    env.fund(C1, COUPON * 1_000).unwrap();
    let t = pay_ts(&env, C1);
    warp(&mut env.svm, t);
    env.claim(&b, C1).unwrap(); // revoked and paused: the recorded coupon is still paid
    env.claim(&f, C1).unwrap();

    env.set_paused(&op, false).unwrap();
    env.transfer(&a, &f.pubkey(), 1).unwrap();
    env.allow(&b.pubkey());
    env.transfer(&a, &b.pubkey(), 1).unwrap();
    env.assert_reserve();
}
