// Server-only: self-service demo issues. A visitor starts a fresh bond with a fast
// calendar, so the role screens always have something live to act on.
import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { getAccount, getAssociatedTokenAddressSync, getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import { LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { BondClient, configPda, makeProgram } from "./pritok-client";
import { INVESTORS, demoContext } from "./demo-signer";

// One "half-year" = 4 minutes: the whole 2-year issue plays out in about 17 minutes.
const PERIOD = 240;
const RECORD_OFFSET = 30;
const MIN_SOL = 0.03 * LAMPORTS_PER_SOL;
const TOP_UP_SOL = 0.1 * LAMPORTS_PER_SOL;
const COOLDOWN_MS = 60_000;

/** Issue terms the issuer sets in the form; amounts in whole tenge. */
export interface IssueTerms {
  faceValue: number;
  couponPct: number;
  coupons: number;
  units: number;
}

export const DEFAULT_TERMS: IssueTerms = { faceValue: 100_000, couponPct: 16, coupons: 4, units: 1_000 };

/** Validates form input; the program enforces the same bounds where it matters. */
export function parseTerms(raw: Partial<IssueTerms> | undefined): IssueTerms {
  const t = { ...DEFAULT_TERMS, ...(raw ?? {}) };
  const ok =
    Number.isInteger(t.faceValue) && t.faceValue >= 1_000 && t.faceValue <= 10_000_000 &&
    Number.isFinite(t.couponPct) && t.couponPct >= 0.1 && t.couponPct <= 50 && Math.round(t.couponPct * 100) === t.couponPct * 100 &&
    Number.isInteger(t.coupons) && t.coupons >= 1 && t.coupons <= 4 &&
    Number.isInteger(t.units) && t.units >= 10 && t.units <= 100_000;
  if (!ok) throw new Error("Проверьте условия: номинал 1 000–10 000 000 ₸, ставка 0,1–50%, от 1 до 4 купонов, 10–100 000 облигаций");
  return t;
}

/** The demo always places the whole issue among three investors: 30% / 20% / 50%. */
function placement(units: number): Record<(typeof INVESTORS)[number], number> {
  const aigerim = Math.floor(units * 0.3);
  const bolat = Math.floor(units * 0.2);
  return { aigerim, bolat, fund: units - aigerim - bolat };
}

function program() {
  const { conn, keys } = demoContext();
  return makeProgram(new AnchorProvider(conn, new Wallet(keys.payer), { commitment: "confirmed" }));
}

/** Newest bond created by the demo issuer, or null. */
export async function latestDemoBond(): Promise<string | null> {
  const { keys } = demoContext();
  const bonds = await program().account.bond.all([{ memcmp: { offset: 8, bytes: keys.issuer.publicKey.toBase58() } }]);
  if (!bonds.length) return null;
  bonds.sort((a, b) => b.account.bondId.cmp(a.account.bondId));
  return bonds[0].publicKey.toBase58();
}

async function chainTime() {
  const { conn } = demoContext();
  // A just-produced slot often has no block time yet on devnet: fall back to the clock.
  const t = await conn.getBlockTime(await conn.getSlot()).catch(() => null);
  return t ?? Math.floor(Date.now() / 1000);
}

/** Keeps demo wallets able to pay rent and fees, and to buy and pay out bonds. */
async function topUp(tkzt: PublicKey, issueTiyn: bigint) {
  const { conn, keys } = demoContext();
  const actors = [keys.issuer, keys.operator, ...INVESTORS.map((i) => keys[i])];
  const tx = new Transaction();
  const balances = await Promise.all(actors.map((a) => conn.getBalance(a.publicKey)));
  actors.forEach((a, i) => {
    // The operator pays rent for every receipt it creates when executing payouts: keep more on it.
    const op = a === keys.operator;
    if (balances[i] < (op ? 4 : 1) * MIN_SOL)
      tx.add(SystemProgram.transfer({ fromPubkey: keys.payer.publicKey, toPubkey: a.publicKey, lamports: (op ? 5 : 1) * TOP_UP_SOL }));
  });
  if (tx.instructions.length) await conn.sendTransaction(tx, [keys.payer]).then((s) => conn.confirmTransaction(s, "confirmed"));

  // The registrar is the tKZT faucet (mint authority) in the demo.
  const targets: [PublicKey, bigint][] = [
    // The issuer pays coupons (at most 100% of the issue: 50% a year for 2 years) and principal.
    [keys.issuer.publicKey, issueTiyn * 2n],
    // Each investor can buy the whole issue, so trades between them always have cover.
    ...INVESTORS.map((i): [PublicKey, bigint] => [keys[i].publicKey, issueTiyn]),
    [keys.operator.publicKey, 0n],
  ];
  await Promise.all(
    targets.map(async ([owner, want]) => {
      const ata = await getOrCreateAssociatedTokenAccount(conn, keys.payer, tkzt, owner);
      if (ata.amount < want) await mintTo(conn, keys.payer, tkzt, ata.address, keys.operator, want - ata.amount);
    }),
  );
}

let lastCreated: { at: number; bond: string } | null = null;

/** Creates, admits and places a fresh demo bond; returns its address. */
export async function createDemoBond(raw?: Partial<IssueTerms>): Promise<{ bond: string; reused: boolean }> {
  const terms = parseTerms(raw);
  if (lastCreated && Date.now() - lastCreated.at < COOLDOWN_MS) return { bond: lastCreated.bond, reused: true };
  const { keys } = demoContext();
  const p = program();
  const config = await p.account.config.fetch(configPda());
  const tkzt = config.paymentMints[0];
  const face = BigInt(terms.faceValue) * 100n; // tiyn
  await topUp(tkzt, face * BigInt(terms.units));

  const now = await chainTime();
  const start = now + 10;
  const c = new BondClient(p, keys.issuer.publicKey, BigInt(now), tkzt);
  await c.createBond(keys.issuer, {
    bondId: BigInt(now),
    faceValue: face,
    couponBps: Math.round(terms.couponPct * 100),
    periodSecs: PERIOD,
    startTs: start,
    recordOffsetSecs: RECORD_OFFSET,
    numPeriods: terms.coupons,
    subscriptionEndTs: start + 60,
  });
  lastCreated = { at: Date.now(), bond: c.bond.toBase58() };
  await Promise.all(INVESTORS.map((i) => c.allowHolder(keys.operator, keys[i].publicKey)));
  const shares = placement(terms.units);
  await Promise.all(INVESTORS.filter((i) => shares[i] > 0).map((i) => c.subscribe(keys[i], shares[i])));

  // Sanity check: placement landed.
  const vaultOk = await getAccount(demoContext().conn, getAssociatedTokenAddressSync(tkzt, c.bond, true)).then(() => true, () => false);
  if (!vaultOk) throw new Error("Выпуск создан не полностью");
  return { bond: c.bond.toBase58(), reused: false };
}
