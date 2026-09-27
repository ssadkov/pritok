# PRITOK

**Bond registry and payouts on Solana.** *Pritok* is Russian for "inflow": coupons and principal flowing to bondholders on schedule.

PRITOK services a tokenized bond after placement — the job of a registrar and a paying agent: who holds the bond on the record date, how much each holder is owed, and whether the issuer actually paid. Every entitlement and every payment is verifiable onchain.

Built for the Superteam Kazakhstan × KASE side track [*Corporate Actions on Blockchain*](https://superteam.fun/earn/listing/superteam-kazakhstan-x-kase-side-track-corporate-actions-on-blockchain). Independent prototype, not affiliated with KASE.

## Status (2026-09-27, program upgraded same day)

| | |
|---|---|
| Program | deployed to **devnet**: [`9LMSMqD3xMBaNdfRb4bKDT3MBTX8ry1Na84rMSJ787aY`](https://explorer.solana.com/address/9LMSMqD3xMBaNdfRb4bKDT3MBTX8ry1Na84rMSJ787aY?cluster=devnet) |
| Tests | 17 passing (6 unit, 11 LiteSVM integration) |
| Devnet run | full bond lifecycle, 40 transactions — bond [`2dwYhf…u8RG`](https://explorer.solana.com/address/2dwYhfHkJCpuwrhYBCvZpLYEzrbkVHzW2tyjzMNXu8RG?cluster=devnet) |
| Web | live public registry (`web/`, Next.js) reading devnet |
| Web | role screens: issuer, investor, registrar / paying agent (devnet demo signing) |
| Not yet built | DvP trade with accrued interest |

## Corporate actions

| Action | How it works |
|---|---|
| **Coupon** | Scheduled at issue. Entitlement = bonds held at the record date × coupon per bond. Holders claim after the payment date. |
| **Partial redemption** (extra action) | Declared by the issuer on the date of a future coupon and funded in the same transaction. Later coupons and maturity are recalculated on the reduced face value. |
| **Maturity** | Transfers close at the maturity record date. `redeem` burns the holder's bonds and pays principal plus the last coupon in one transaction. |
| **Bank payout** | Instead of claiming to a wallet, a holder (or the registrar for a holder without a wallet) sends the payout to the paying agent. The money leaves the vault onchain; the agent then attests the bank transfer, storing only a SHA-256 of the payment reference. A payout goes to the wallet or to the bank, once. |
| **Default** | If an event is underfunded on its payment date, anyone can mark it defaulted. Claims stay closed until the issuer pays the full amount; the debt is never written down. |

## Design

**Bond tokens are always frozen.** The bond is a Token-2022 mint with `DefaultAccountState = Frozen`; the bond PDA is the mint and freeze authority. Every movement — subscription, transfer, redemption — is one program instruction that thaws, moves, re-freezes and updates the registry. A holder cannot transfer, burn, delegate or re-assign a bond account directly through Token-2022 (tested: all fail with `AccountFrozen`). Bonds cannot be sent from a regular wallet — as with a real security, transfers go through the registrar.

**Record dates without snapshots.** Events are kept in the bond account, sorted by record date. Before any balance change, the program writes the holder's balance into a slot for every record date that has passed since the holder's last change. A holder's entitlement for an event is that slot, or the current balance if nothing has changed since. No holder iteration, no offchain snapshot, no transfer freeze around the record date.

**Money.** Placement proceeds go straight to the issuer. Payouts go through a vault owned by the bond PDA: the issuer funds it, only the program pays out of it, and every instruction checks `vault balance ≥ funded-but-unclaimed obligations`. Each payout creates a receipt account, so nothing is paid twice. The payment token is **tKZT**, a test tenge on devnet; the operator keeps an allowlist and Token-2022 mints with transfer fees or hooks are rejected.

**Roles.** Issuer: creates the bond, funds events, declares partial redemptions. Operator (registrar / paying agent): admits and revokes holders, pauses subscriptions and transfers, confirms bank payouts. Revocation and pause never cancel payouts that already exist. Holder: subscribes, transfers, claims, redeems. Anyone: marks a default, reads everything.

## Implemented vs simulated

| Implemented onchain | Simulated |
|---|---|
| bond token, holder registry, admission | KYC (the operator simply admits an address) |
| record dates, entitlements, coupons, partial redemption, maturity with burn | tKZT instead of a real tenge stablecoin |
| default, issuer debt and cure | accelerated time (a "half-year" is minutes) |
| bank payout: money to the paying agent, confirmation with a reference hash | the bank transfer itself (the confirmation is the paying agent's statement) |

## Repository

```
programs/pritok/     Anchor program + LiteSVM tests
client/              TypeScript client and the devnet scenario
web/                 Next.js app: public registry on live devnet data
docs/PLAN.md         plan and design decisions (Russian)
docs/REVIEW-BRIEF.md brief for independent design review
scripts/wsl-test.sh  build + test inside the WSL filesystem
```

## Build and test

Anchor 0.32.1, Agave 3.1.12, Rust 1.89.

```bash
anchor build
cargo test -p pritok
```

On Windows, `scripts/wsl-test.sh` builds in the WSL filesystem, which is much faster than `/mnt/c`.

## Devnet scenario

```bash
cd client && npm install
npm run scenario
```

The first run creates role keys in `client/.keys` (gitignored) and asks you to fund the payer with 1 devnet SOL. The run takes about 11 minutes and writes every transaction link to `client/out/`.

## Web

```bash
cd web && npm install
cp .env.example .env.local   # set RPC_URL to a dedicated devnet RPC
npm run dev                  # http://localhost:3100
```

Role screens sign with devnet demo keys when `DEMO_SIGNING=1`: from `client/.keys` locally, or from `DEMO_KEYS` (JSON of secret-key byte arrays) on a host such as Vercel, with Root Directory `web`. Anyone with the link can press the buttons — devnet only.

The public devnet RPC rate-limits the registry reads (holder and receipt accounts plus transaction history); use a dedicated endpoint such as Helius devnet.
