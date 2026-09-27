use anchor_lang::prelude::*;

/// Hard cap on corporate-action events per bond: coupons + maturity + ad-hoc actions.
pub const MAX_EVENTS: usize = 8;
/// Coupons are limited so that maturity and up to 3 ad-hoc actions still fit.
pub const MAX_PERIODS: u8 = 4;
pub const MAX_PAYMENT_MINTS: usize = 4;
pub const BPS: u128 = 10_000;
/// Coupons are paid twice per "year".
pub const COUPONS_PER_YEAR: u128 = 2;

pub mod kind {
    pub const COUPON: u8 = 0;
    pub const PARTIAL_REDEMPTION: u8 = 1;
    pub const MATURITY: u8 = 2;
}

pub mod mode {
    pub const ONCHAIN: u8 = 0;
    pub const BANK: u8 = 1;
}

pub mod event_status {
    pub const SCHEDULED: u8 = 0;
    pub const FUNDED: u8 = 1;
    pub const DEFAULTED: u8 = 2;
}

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub operator: Pubkey,
    pub paused: bool,
    pub payment_mints: [Pubkey; MAX_PAYMENT_MINTS],
    pub payment_mints_len: u8,
    pub bump: u8,
}

impl Config {
    pub fn is_payment_mint(&self, mint: &Pubkey) -> bool {
        self.payment_mints[..self.payment_mints_len as usize].contains(mint)
    }
}

/// One corporate-action event. `action_id` is a stable name (used in claim PDAs);
/// the event's index in `Bond::events` is its chronological position.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default, InitSpace, PartialEq, Eq, Debug)]
pub struct Event {
    pub action_id: u8,
    pub kind: u8,
    pub record_ts: i64,
    pub pay_ts: i64,
    /// Face-value factor this event is calculated from (10 000 = 100%).
    pub factor_bps_applied: u16,
    pub amount_per_unit: u64,
    pub funded: u64,
    pub claimed: u64,
    pub mode: u8,
    pub status: u8,
}

pub mod claim_status {
    /// Paid to the holder's wallet.
    pub const PAID: u8 = 0;
    /// Moved to the paying agent for a bank transfer.
    pub const BANK_REQUESTED: u8 = 1;
    /// Paying agent attested the bank transfer.
    pub const BANK_CONFIRMED: u8 = 2;
}

/// Receipt for one holder's payout on one event; its existence prevents double payment.
#[account]
#[derive(InitSpace)]
pub struct Claim {
    pub bond: Pubkey,
    pub owner: Pubkey,
    pub action_id: u8,
    pub units: u64,
    pub amount: u64,
    pub status: u8,
    pub bank_ref_hash: [u8; 32],
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Bond {
    pub issuer: Pubkey,
    pub bond_id: u64,
    pub bond_mint: Pubkey,
    pub payment_mint: Pubkey,
    pub face_value: u64,
    pub coupon_bps: u16,
    pub period_secs: i64,
    pub start_ts: i64,
    pub record_offset_secs: i64,
    pub num_periods: u8,
    /// Face-value factor after all declared partial redemptions (10 000 = 100%).
    /// Each event carries the factor it is calculated from in `factor_bps_applied`.
    pub factor_bps: u16,
    pub subscription_end_ts: i64,
    pub subscription_closed: bool,
    /// Bonds outstanding at every record date; fixed when subscription closes.
    pub issued_units: u64,
    /// Bonds not yet burned.
    pub supply: u64,
    /// Funded and not yet claimed onchain obligations held in the payment vault.
    pub reserved: u64,
    /// Sorted by `record_ts` (ties keep insertion order).
    pub events: [Event; MAX_EVENTS],
    pub events_len: u8,
    pub next_action_id: u8,
    pub bump: u8,
    pub mint_bump: u8,
}

impl Bond {
    pub fn events(&self) -> &[Event] {
        &self.events[..self.events_len as usize]
    }

    pub fn position(&self, action_id: u8) -> Option<usize> {
        self.events().iter().position(|e| e.action_id == action_id)
    }

    /// Fixes `issued_units` once the subscription window has ended.
    pub fn close_subscription_if_due(&mut self, now: i64) {
        if !self.subscription_closed && now >= self.subscription_end_ts {
            self.subscription_closed = true;
            self.issued_units = self.supply;
        }
    }

    pub fn required(&self, event: &Event) -> Option<u64> {
        event.amount_per_unit.checked_mul(self.issued_units)
    }

    /// Every event is fully funded, so the issuer owes nothing.
    pub fn fully_funded(&self) -> bool {
        self.events()
            .iter()
            .all(|e| e.mode == mode::BANK || Some(e.funded) == self.required(e))
    }

    /// Inserts a partial redemption on the date of the future coupon at `coupon_pos`
    /// and reduces the face factor of every later coupon and of maturity.
    /// Returns the new event's position.
    pub fn insert_partial_redemption(&mut self, coupon_pos: usize, redeem_bps: u16) -> usize {
        let coupon = self.events[coupon_pos];
        let pos = coupon_pos + 1;
        let len = self.events_len as usize;
        for i in (pos..len).rev() {
            self.events[i + 1] = self.events[i];
        }
        self.events[pos] = Event {
            action_id: self.next_action_id,
            kind: kind::PARTIAL_REDEMPTION,
            record_ts: coupon.record_ts,
            pay_ts: coupon.pay_ts,
            factor_bps_applied: redeem_bps,
            amount_per_unit: self.principal_per_unit(redeem_bps),
            ..Event::default()
        };
        self.events_len += 1;
        self.next_action_id += 1;
        self.factor_bps -= redeem_bps;
        for i in pos + 1..self.events_len as usize {
            let e = &mut self.events[i];
            match e.kind {
                kind::COUPON | kind::MATURITY => {
                    e.factor_bps_applied -= redeem_bps;
                }
                _ => continue,
            }
            let factor = e.factor_bps_applied;
            let amount = if e.kind == kind::COUPON {
                self.coupon_per_unit(factor)
            } else {
                self.principal_per_unit(factor)
            };
            self.events[i].amount_per_unit = amount;
        }
        pos
    }

    pub fn coupon_per_unit(&self, factor_bps: u16) -> u64 {
        (self.face_value as u128 * factor_bps as u128 * self.coupon_bps as u128
            / (BPS * BPS * COUPONS_PER_YEAR)) as u64
    }

    pub fn principal_per_unit(&self, factor_bps: u16) -> u64 {
        (self.face_value as u128 * factor_bps as u128 / BPS) as u64
    }

    /// Record date of the maturity event; transfers are closed from this moment.
    pub fn maturity_record_ts(&self) -> i64 {
        self.events()
            .iter()
            .find(|e| e.kind == kind::MATURITY)
            .map(|e| e.record_ts)
            .unwrap_or(i64::MAX)
    }

    /// Builds the scheduled coupons and maturity. Coupon k pays at start + k·period,
    /// its record date is `record_offset_secs` earlier. Maturity shares the last coupon's dates.
    pub fn build_schedule(&mut self) {
        let mut len = 0usize;
        for k in 1..=self.num_periods as i64 {
            let pay_ts = self.start_ts + k * self.period_secs;
            self.events[len] = Event {
                action_id: len as u8,
                kind: kind::COUPON,
                record_ts: pay_ts - self.record_offset_secs,
                pay_ts,
                factor_bps_applied: self.factor_bps,
                amount_per_unit: self.coupon_per_unit(self.factor_bps),
                ..Event::default()
            };
            len += 1;
        }
        let last = self.events[len - 1];
        self.events[len] = Event {
            action_id: len as u8,
            kind: kind::MATURITY,
            record_ts: last.record_ts,
            pay_ts: last.pay_ts,
            factor_bps_applied: self.factor_bps,
            amount_per_unit: self.principal_per_unit(self.factor_bps),
            ..Event::default()
        };
        len += 1;
        self.events_len = len as u8;
        self.next_action_id = len as u8;
    }
}

#[account]
#[derive(InitSpace)]
pub struct Holder {
    pub bond: Pubkey,
    pub owner: Pubkey,
    pub allowed: bool,
    pub balance: u64,
    /// Number of leading events whose record-date balance is frozen in `bal_at`.
    pub synced_upto: u8,
    /// Balance at the record date of the event at the same chronological position.
    pub bal_at: [u64; MAX_EVENTS],
    pub bump: u8,
}

impl Holder {
    /// Must run before every balance change: freezes the current balance for every
    /// record date that has passed since the holder's last change.
    pub fn sync(&mut self, bond: &Bond, now: i64) {
        let events = bond.events();
        while (self.synced_upto as usize) < events.len()
            && events[self.synced_upto as usize].record_ts <= now
        {
            self.bal_at[self.synced_upto as usize] = self.balance;
            self.synced_upto += 1;
        }
    }

    /// Units this holder is entitled to for the event at chronological position `pos`.
    /// `None` until the record date has passed.
    pub fn units_at(&self, bond: &Bond, pos: usize, now: i64) -> Option<u64> {
        let event = bond.events().get(pos)?;
        if event.record_ts > now {
            return None;
        }
        if pos < self.synced_upto as usize {
            Some(self.bal_at[pos])
        } else {
            Some(self.balance)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const DAY: i64 = 60;

    fn bond() -> Bond {
        let mut b = Bond {
            issuer: Pubkey::default(),
            bond_id: 1,
            bond_mint: Pubkey::default(),
            payment_mint: Pubkey::default(),
            face_value: 10_000_000, // 100 000.00 tKZT
            coupon_bps: 1_600,
            period_secs: 180 * DAY,
            start_ts: 1_000,
            record_offset_secs: 3 * DAY,
            num_periods: 4,
            factor_bps: 10_000,
            subscription_end_ts: 1_000 + DAY,
            subscription_closed: false,
            issued_units: 0,
            supply: 0,
            reserved: 0,
            events: [Event::default(); MAX_EVENTS],
            events_len: 0,
            next_action_id: 0,
            bump: 0,
            mint_bump: 0,
        };
        b.build_schedule();
        b
    }

    fn holder(balance: u64) -> Holder {
        Holder {
            bond: Pubkey::default(),
            owner: Pubkey::default(),
            allowed: true,
            balance,
            synced_upto: 0,
            bal_at: [0; MAX_EVENTS],
            bump: 0,
        }
    }

    fn change(h: &mut Holder, b: &Bond, now: i64, delta: i64) {
        h.sync(b, now);
        h.balance = (h.balance as i64 + delta) as u64;
    }

    #[test]
    fn schedule_amounts() {
        let b = bond();
        assert_eq!(b.events_len, 5);
        assert_eq!(b.events[0].amount_per_unit, 800_000); // 8 000.00
        assert_eq!(b.events[4].kind, kind::MATURITY);
        assert_eq!(b.events[4].record_ts, b.events[3].record_ts);
        assert_eq!(b.events[4].amount_per_unit, 10_000_000);
    }

    /// Test 1 (logic level): transfer before and after a record date.
    #[test]
    fn transfer_before_and_after_record_date() {
        let b = bond();
        let r1 = b.events[0].record_ts;
        let (mut a, mut bo, mut f) = (holder(300), holder(200), holder(500));

        change(&mut a, &b, r1 - 10, -10);
        change(&mut bo, &b, r1 - 10, 10);
        change(&mut bo, &b, r1 + 10, -10);
        change(&mut f, &b, r1 + 10, 10);

        let now = r1 + 20;
        assert_eq!(a.units_at(&b, 0, now), Some(290));
        assert_eq!(bo.units_at(&b, 0, now), Some(210));
        assert_eq!(f.units_at(&b, 0, now), Some(500));
        // Next coupon not recorded yet.
        assert_eq!(bo.units_at(&b, 1, now), None);

        let r2 = b.events[1].record_ts;
        assert_eq!(bo.units_at(&b, 1, r2), Some(200));
        assert_eq!(f.units_at(&b, 1, r2), Some(510));
    }

    /// Test 8 (logic level): amortization on coupon 2's date reduces only later events.
    #[test]
    fn partial_redemption_insertion() {
        let mut b = bond();
        let coupon2_id = b.events[1].action_id;
        let pos = b.insert_partial_redemption(1, 2_000);
        assert_eq!(pos, 2);
        assert_eq!(b.events_len, 6);
        let pr = b.events[2];
        assert_eq!(pr.kind, kind::PARTIAL_REDEMPTION);
        assert_eq!(pr.record_ts, b.events[1].record_ts);
        assert_eq!(pr.amount_per_unit, 2_000_000); // 20 000.00
        assert_eq!(b.events[1].action_id, coupon2_id);
        assert_eq!(b.events[1].amount_per_unit, 800_000, "coupon 2 accrues on the old face");
        assert_eq!(b.events[3].amount_per_unit, 640_000, "coupon 3 on 80 000");
        assert_eq!(b.events[4].amount_per_unit, 640_000, "coupon 4 on 80 000");
        assert_eq!(b.events[5].kind, kind::MATURITY);
        assert_eq!(b.events[5].amount_per_unit, 8_000_000);
        assert_eq!(b.position(pr.action_id), Some(2));
        assert_eq!(b.factor_bps, 8_000);
    }

    /// Test 9 (logic level): a holder synced before the insertion keeps correct positions.
    #[test]
    fn insertion_after_holder_synced() {
        let mut b = bond();
        let mut h = holder(300);
        let r1 = b.events[0].record_ts;
        change(&mut h, &b, r1 + 1, -50); // synced_upto = 1, bal_at[0] = 300
        b.insert_partial_redemption(1, 2_000); // inserted at pos 2, still in the future
        let r2 = b.events[1].record_ts;
        change(&mut h, &b, r2 + 1, -50);
        assert_eq!(h.units_at(&b, 0, r2 + 1), Some(300));
        assert_eq!(h.units_at(&b, 1, r2 + 1), Some(250), "coupon 2");
        assert_eq!(h.units_at(&b, 2, r2 + 1), Some(250), "partial redemption, same record date");
        assert_eq!(h.units_at(&b, 3, r2 + 1), None);
        assert_eq!(h.units_at(&b, 3, b.events[3].record_ts), Some(200));
    }

    /// Test 2 (logic level): several record dates pass silently, then many transfers.
    #[test]
    fn skipped_events_then_many_transfers() {
        let b = bond();
        let mut h = holder(100);
        let after_r3 = b.events[2].record_ts + 1;
        for _ in 0..20 {
            change(&mut h, &b, after_r3, -1);
        }
        for pos in 0..3 {
            assert_eq!(h.units_at(&b, pos, after_r3), Some(100));
        }
        assert_eq!(h.balance, 80);
        assert_eq!(h.units_at(&b, 3, b.events[3].record_ts), Some(80));
        // Maturity shares the last coupon's record date.
        assert_eq!(h.units_at(&b, 4, b.events[4].record_ts), Some(80));
    }
}
