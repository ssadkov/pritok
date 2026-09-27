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
const FACE = 10_000_000n; // 100 000.00 tKZT
const PLACEMENT = { aigerim: 300, bolat: 200, fund: 500 } as const;
const MIN_SOL = 0.03 * LAMPORTS_PER_SOL;
const TOP_UP_SOL = 0.1 * LAMPORTS_PER_SOL;
const INVESTOR_TKZT = FACE * 1_000n;
const ISSUER_TKZT = FACE * 2_000n;
const COOLDOWN_MS = 60_000;

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
  return (await conn.getBlockTime(await conn.getSlot())) ?? Math.floor(Date.now() / 1000);
}

/** Keeps demo wallets able to pay rent and fees, and to buy and pay out bonds. */
async function topUp(tkzt: PublicKey) {
  const { conn, keys } = demoContext();
  const actors = [keys.issuer, keys.operator, ...INVESTORS.map((i) => keys[i])];
  const tx = new Transaction();
  const balances = await Promise.all(actors.map((a) => conn.getBalance(a.publicKey)));
  actors.forEach((a, i) => {
    if (balances[i] < MIN_SOL) tx.add(SystemProgram.transfer({ fromPubkey: keys.payer.publicKey, toPubkey: a.publicKey, lamports: TOP_UP_SOL }));
  });
  if (tx.instructions.length) await conn.sendTransaction(tx, [keys.payer]).then((s) => conn.confirmTransaction(s, "confirmed"));

  // The registrar is the tKZT faucet (mint authority) in the demo.
  const targets: [PublicKey, bigint][] = [
    [keys.issuer.publicKey, ISSUER_TKZT],
    ...INVESTORS.map((i): [PublicKey, bigint] => [keys[i].publicKey, INVESTOR_TKZT]),
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
export async function createDemoBond(): Promise<{ bond: string; reused: boolean }> {
  if (lastCreated && Date.now() - lastCreated.at < COOLDOWN_MS) return { bond: lastCreated.bond, reused: true };
  const { keys } = demoContext();
  const p = program();
  const config = await p.account.config.fetch(configPda());
  const tkzt = config.paymentMints[0];
  await topUp(tkzt);

  const now = await chainTime();
  const start = now + 10;
  const c = new BondClient(p, keys.issuer.publicKey, BigInt(now), tkzt);
  await c.createBond(keys.issuer, {
    bondId: BigInt(now),
    faceValue: FACE,
    couponBps: 1_600,
    periodSecs: PERIOD,
    startTs: start,
    recordOffsetSecs: RECORD_OFFSET,
    numPeriods: 4,
    subscriptionEndTs: start + 60,
  });
  lastCreated = { at: Date.now(), bond: c.bond.toBase58() };
  await Promise.all(INVESTORS.map((i) => c.allowHolder(keys.operator, keys[i].publicKey)));
  await Promise.all(INVESTORS.map((i) => c.subscribe(keys[i], PLACEMENT[i])));

  // Sanity check: placement landed.
  const vaultOk = await getAccount(demoContext().conn, getAssociatedTokenAddressSync(tkzt, c.bond, true)).then(() => true, () => false);
  if (!vaultOk) throw new Error("Выпуск создан не полностью");
  return { bond: c.bond.toBase58(), reused: false };
}
