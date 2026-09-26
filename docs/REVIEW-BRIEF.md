# Review brief for an independent agent

You are reviewing the **development plan** of PRITOK before any code is written.
Read [PLAN.md](PLAN.md) in full (it is in Russian), then answer the questions below.

## Context in three lines

- Hackathon side track "Corporate Actions on Blockchain" (Superteam Kazakhstan × KASE). Submission deadline **2026-10-13 06:59 UTC**, one developer with an AI coding agent, ~7 working days.
- Required: tokenized test bond with holder registry, record-date mechanism, entitlement calculation, coupon payment, redemption with token retirement, one extra corporate action (we chose partial early redemption), verifiable onchain record. Fiat rails may be simulated; Solana logic must work. Judging: technical execution 30%, corporate-action logic 25%, product/UX 20%, real-world applicability 15%, innovation 10%.
- Target: Solana **devnet**, Anchor 0.32.1, Agave 3.1.12, Token-2022.

Source listing: https://superteam.fun/earn/listing/superteam-kazakhstan-x-kase-side-track-corporate-actions-on-blockchain

## Round 2 (plan v2, 2026-09-27)

Round 1 found that a transfer hook can be bypassed (owner self-burn, `SetAuthority`), that ad-hoc actions broke id-ordered checkpoints, that the ring buffer could evict unclaimed rights, that maturity after record date could strand tokens, and that default forgave the issuer's shortfall. Plan v2 (PLAN §5.0–5.5) replaces the hook with **always-frozen token accounts moved only by the program**, a chronological schedule with fixed per-holder slots, all-or-nothing payouts with persistent issuer debt, and a transfer lock after the maturity record date.

## What to check — highest risk first

1. **Frozen-account model (§5.0, §5.1).** Mint with `DefaultAccountState = Frozen`, freeze + mint authority = `Bond` PDA; every instruction that moves bonds does thaw → mint/transfer/burn → freeze in one instruction; only canonical Token-2022 ATAs accepted.
   - Is there **any** Token-2022 instruction a holder can execute on a frozen account that changes balance, owner, delegate or closes it? (`Burn`, `Transfer`, `SetAuthority`, `Approve`, `CloseAccount`, `WithdrawExcessLamports`, confidential-transfer or other extension instructions.)
   - Can an attacker leave an account thawed (e.g. instruction fails mid-way, or a crafted transaction composes our thaw with a Token-2022 instruction)? Each thaw and re-freeze happens inside a single program instruction — is that sufficient?
   - Anything about `DefaultAccountState` + ATA creation by third parties that breaks the model?
2. **Record-date rule (§5.3).** `Bond.schedule` sorted by `record_ts`; per holder `synced_upto` + `bal_at[MAX_EVENTS]`; on every balance change fill `bal_at` for all passed record dates, then change balance. Entitlement at position i = `bal_at[i]` if `i < synced_upto`, else current balance. Ad-hoc actions may be inserted only with `record_ts > now`.
   - Find an ordering of subscriptions, transfers, ad-hoc insertions, record dates and claims that pays the wrong amount, the wrong holder, or twice.
   - Is the insertion argument ("no holder has synced any position with `record_ts > now`") airtight, including holders whose last update was long ago?
3. **Money logic (§5.4).** All-or-nothing per action, `mark_default`, later cure; partial redemption funded atomically at declaration; no issuer withdrawals; `units_at_record = supply` justified by "subscription closes before first record date, burns only at maturity". Any path to over-pay, under-reserve, or lose a holder's claim?
4. **Bank path (§5.5).** Now explicitly labelled as operator attestation, simulated. Anything still misleading?
5. **Scope vs. time (§7).** Critical path ~6 days, bank path after it. Realistic?
6. **Demo (§4, 13 steps).** Covers the judging criteria?

## How to answer

- One list of findings, most severe first. For each: what breaks, a concrete scenario, suggested fix.
- Separate **confirmed** (you checked docs/source) from **suspected**.
- Do not rewrite the plan; do not write code.
