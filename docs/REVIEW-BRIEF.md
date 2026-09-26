# Review brief for an independent agent

You are reviewing the **development plan** of PRITOK before any code is written.
Read [PLAN.md](PLAN.md) in full (it is in Russian), then answer the questions below.

## Context in three lines

- Hackathon side track "Corporate Actions on Blockchain" (Superteam Kazakhstan × KASE). Submission deadline **2026-10-13 06:59 UTC**, one developer with an AI coding agent, ~7 working days.
- Required: tokenized test bond with holder registry, record-date mechanism, entitlement calculation, coupon payment, redemption with token retirement, one extra corporate action (we chose partial early redemption), verifiable onchain record. Fiat rails may be simulated; Solana logic must work. Judging: technical execution 30%, corporate-action logic 25%, product/UX 20%, real-world applicability 15%, innovation 10%.
- Target: Solana **devnet**, Anchor 0.32.1, Agave 3.1.12, Token-2022.

Source listing: https://superteam.fun/earn/listing/superteam-kazakhstan-x-kase-side-track-corporate-actions-on-blockchain

## What to check — highest risk first

1. **Record-date design (PLAN §5.0, §5.3).** Transfer hook in a separate program keeps a per-holder `balance_mirror` plus range checkpoints `(from_action, to_action, balance)`. Entitlement for action N = matching checkpoint, else current mirror.
   - Is the rule correct for every ordering of transfers, record dates and claims? Find a sequence that pays the wrong holder or pays twice.
   - Can the hook compute "which record dates have passed" cheaply from `Bond` + `Clock`, including ad-hoc record dates?
   - Is splitting into `pritok_registry` (hook + `Holder`) and `pritok` (everything else) necessary and sufficient to avoid `ReentrancyNotAllowed` for `trade_dvp`? Any other CPI path that re-enters?
   - Token-2022 hook constraints: writable extra accounts via `ExtraAccountMetaList`, PDA seeds derived from the destination owner, account size limits. Anything that breaks the design?
2. **Paths that bypass the hook:** mint, burn, owner self-burn, `close_account`, freeze/thaw. Is the self-burn mitigation (sync mirror down at claim) sound? Anything else that desyncs `balance_mirror`?
3. **Money logic (§5.4).** Coupon on amortized face value, partial-redemption factor, default with pro-rata payout, rounding down per holder with remainder back to the issuer. Any path where the vault pays out more than was funded, or the issuer withdraws holders' money?
4. **Bank settlement path (§5.5).** Is the flow (onchain claim instruction → issuer marks funding → operator confirms with payment-reference hash) credible to a stock exchange / central depository? What would a KASE reviewer find naive?
5. **Role separation (§3).** Can the issuer or operator do anything harmful the plan says they cannot?
6. **Scope vs. time (§7).** Is ~7 days realistic? What would you cut first? Is anything missing that the listing explicitly requires?
7. **Demo (§4).** Does the 12-step scenario show everything the judges weight? Is the "period = minutes" demo clock a problem for credibility?

## How to answer

- One list of findings, most severe first. For each: what breaks, a concrete scenario, suggested fix.
- Separate **confirmed** (you checked docs/source) from **suspected**.
- Do not rewrite the plan; do not write code.
