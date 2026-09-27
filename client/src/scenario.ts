// Full "SteppeLogistic" scenario on devnet (docs/PLAN.md §4), with accelerated time.
// Usage: npm run scenario   (keys are created in client/.keys, output in client/out)
import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import {
  TOKEN_PROGRAM_ID,
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAccount,
} from "@solana/spl-token";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import fs from "node:fs";
import path from "node:path";
import { BondClient, configPda, kind, makeProgram, payAta } from "./pritok.js";

const RPC = process.env.RPC_URL ?? "https://api.devnet.solana.com";
const KEYS = path.resolve(import.meta.dirname, "../.keys");
const OUT = path.resolve(import.meta.dirname, "../out");

// Accelerated calendar: one "half-year" = PERIOD seconds.
const PERIOD = Number(process.env.PERIOD ?? 150);
const RECORD_OFFSET = 25;
// MODE=setup stops after placement and leaves every corporate action to the web UI.
const SETUP_ONLY = process.env.MODE === "setup";
const FACE = 10_000_000n; // 100 000.00 tKZT (2 decimals)
const COUPON_BPS = 1_600;
const ISSUE = { aigerim: 300, bolat: 200, fund: 500 };

const conn = new Connection(RPC, "confirmed");
const log: { step: string; sig?: string; note?: string }[] = [];
const explorer = (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`;

function key(name: string): Keypair {
  fs.mkdirSync(KEYS, { recursive: true });
  const file = path.join(KEYS, `${name}.json`);
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify([...Keypair.generate().secretKey]));
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(file, "utf8"))));
}

async function step(name: string, fn: () => Promise<string>, note?: string) {
  const sig = await fn();
  log.push({ step: name, sig, note });
  console.log(`✓ ${name}${note ? ` — ${note}` : ""}\n  ${explorer(sig)}`);
  return sig;
}

async function expectFail(name: string, fn: () => Promise<string>, errName: string) {
  try {
    await fn();
  } catch (e) {
    const msg = String((e as Error).message ?? e) + JSON.stringify((e as { logs?: string[] }).logs ?? []);
    if (!msg.includes(errName)) throw new Error(`${name}: expected ${errName}, got ${msg}`);
    log.push({ step: name, note: `rejected: ${errName}` });
    console.log(`✓ ${name} — rejected (${errName})`);
    return;
  }
  throw new Error(`${name}: expected failure ${errName}`);
}

async function chainTime() {
  const slot = await conn.getSlot();
  return (await conn.getBlockTime(slot)) ?? Math.floor(Date.now() / 1000);
}

async function waitUntil(ts: number, label: string) {
  for (;;) {
    const now = await chainTime();
    if (now >= ts) return;
    process.stdout.write(`… waiting ${ts - now}s for ${label}\r`);
    await new Promise((r) => setTimeout(r, Math.min(5_000, (ts - now) * 1000)));
  }
}

async function tkztBalance(owner: PublicKey, mint: PublicKey) {
  return (await getAccount(conn, payAta(owner, mint))).amount;
}

async function main() {
  const payer = key("payer");
  const bal = await conn.getBalance(payer.publicKey);
  if (bal < 0.5 * LAMPORTS_PER_SOL) {
    throw new Error(`Fund the devnet payer first: solana transfer --url devnet ${payer.publicKey} 1 --allow-unfunded-recipient`);
  }
  const [operator, issuer, aigerim, bolat, fund] = ["operator", "issuer", "aigerim", "bolat", "fund"].map(key);
  const actors = { operator, issuer, aigerim, bolat, fund };

  // Every actor pays its own receipts/ATAs: top up to 0.05 SOL.
  const topUp = new Transaction();
  for (const kp of Object.values(actors)) {
    const b = await conn.getBalance(kp.publicKey);
    if (b < 0.03 * LAMPORTS_PER_SOL) {
      topUp.add(SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: kp.publicKey, lamports: 0.05 * LAMPORTS_PER_SOL - b }));
    }
  }
  if (topUp.instructions.length) await conn.sendTransaction(topUp, [payer]).then((s) => conn.confirmTransaction(s));

  const provider = new AnchorProvider(conn, new Wallet(payer), { commitment: "confirmed" });
  const program = makeProgram(provider);

  // tKZT: classic SPL mint, operator is the faucet. Reused across runs.
  const tkztFile = path.join(KEYS, "tkzt.json");
  let tkzt: PublicKey;
  if (fs.existsSync(tkztFile)) {
    tkzt = new PublicKey(JSON.parse(fs.readFileSync(tkztFile, "utf8")));
  } else {
    tkzt = await createMint(conn, payer, operator.publicKey, null, 2, undefined, undefined, TOKEN_PROGRAM_ID);
    fs.writeFileSync(tkztFile, JSON.stringify(tkzt.toBase58()));
    console.log(`✓ tKZT mint ${tkzt}`);
  }

  const cfg = await program.account.config.fetchNullable(configPda());
  if (!cfg) {
    await step("init config (tKZT allowlisted)", () => BondClient.initConfig(program, operator, [tkzt]));
  } else if (!cfg.operator.equals(operator.publicKey)) {
    throw new Error(`Config already initialized by another operator: ${cfg.operator}`);
  }

  // Faucet: investors can pay for their bonds, the issuer can pay coupons and principal.
  const faucet = async (owner: PublicKey, amount: bigint) => {
    const ata = await getOrCreateAssociatedTokenAccount(conn, payer, tkzt, owner);
    if (ata.amount < amount) await mintTo(conn, payer, tkzt, ata.address, operator, amount - ata.amount);
  };
  await faucet(aigerim.publicKey, FACE * 1_000n);
  await faucet(bolat.publicKey, FACE * 1_000n);
  await faucet(fund.publicKey, FACE * 1_000n);
  await faucet(issuer.publicKey, FACE * 2_000n);
  // The registrar is also the paying agent: bank payouts land in its tKZT account.
  await getOrCreateAssociatedTokenAccount(conn, payer, tkzt, operator.publicKey);

  // --- 2. Issue
  const now = await chainTime();
  const bondId = BigInt(now);
  const start = now + 20;
  const params = {
    bondId,
    faceValue: FACE,
    couponBps: COUPON_BPS,
    periodSecs: PERIOD,
    startTs: start,
    recordOffsetSecs: RECORD_OFFSET,
    numPeriods: 4,
    subscriptionEndTs: start + 40,
  };
  const c = new BondClient(program, issuer.publicKey, bondId, tkzt);
  console.log(`\nBond ${c.bond}\nBond mint ${c.bondMint}\n`);
  await step("issuer creates the bond", () => c.createBond(issuer, params), "1 000 × 100 000 tKZT, 16%, 4 coupons");

  // --- 1. Admission
  for (const [name, kp] of Object.entries({ aigerim, bolat, fund })) {
    await step(`operator admits ${name}`, () => c.allowHolder(operator, kp.publicKey));
  }

  // --- 3. Placement
  const issuerBefore = await tkztBalance(issuer.publicKey, tkzt);
  await step("Aigerim subscribes 300", () => c.subscribe(aigerim, ISSUE.aigerim));
  await step("Bolat subscribes 200", () => c.subscribe(bolat, ISSUE.bolat));
  await step("Fund subscribes 500", () => c.subscribe(fund, ISSUE.fund));
  const raised = (await tkztBalance(issuer.publicKey, tkzt)) - issuerBefore;
  console.log(`  issuer raised ${Number(raised) / 100} tKZT`);

  await waitUntil(params.subscriptionEndTs, "subscription end");
  await step("subscription closed", () => c.closeSubscription(), "issued_units fixed at 1 000");

  if (SETUP_ONLY) {
    writeOut(program.programId, c, tkzt, actors, bondId);
    console.log(`\nsetup done — open /bond/${c.bond} and continue from the UI`);
    return;
  }

  const bond0 = await c.fetchBond();
  const ev = (id: number) => bond0.events.find((e) => e.actionId === id)!;
  const [C1, C2, C3, C4, MAT] = [0, 1, 2, 3, 4];

  // --- 4–6. Record date 1
  await step("Aigerim → Bolat 10 before record date 1", () => c.transfer(aigerim, bolat.publicKey, 10));
  await waitUntil(ev(C1).recordTs.toNumber(), "record date 1");
  await step("Bolat → Fund 10 after record date 1", () => c.transfer(bolat, fund.publicKey, 10), "coupon 1 stays with Bolat");

  // --- 7. Coupon 1
  await step("issuer funds coupon 1", () => c.fund(issuer, C1, 800_000n * 1_000n));
  await waitUntil(ev(C1).payTs.toNumber(), "coupon 1 payment date");
  for (const [name, kp] of Object.entries({ aigerim, bolat, fund })) {
    await step(`${name} claims coupon 1`, () => c.claim(kp, C1));
  }

  // --- 8–9. Partial redemption 20% on coupon 2's date, funded at declaration
  await step("issuer declares 20% partial redemption on coupon 2 date", () => c.declarePartialRedemption(issuer, C2, 2_000), "20 000 × 1 000 funded now");
  const PR = 5;
  await step("issuer funds coupon 2 (on 100 000 face)", () => c.fund(issuer, C2, 800_000n * 1_000n));
  await waitUntil(ev(C2).payTs.toNumber(), "coupon 2 payment date");
  for (const [name, kp] of Object.entries({ aigerim, bolat, fund })) {
    await step(`${name} claims coupon 2`, () => c.claim(kp, C2));
    await step(`${name} claims partial redemption`, () => c.claim(kp, PR));
  }

  // --- 10–11. Coupon 3: 75% funded → default → cure
  const c3 = 640_000n * 1_000n;
  await step("issuer funds only 75% of coupon 3", () => c.fund(issuer, C3, (c3 * 3n) / 4n));
  await waitUntil(ev(C3).payTs.toNumber(), "coupon 3 payment date");
  await expectFail("Aigerim claims unfunded coupon 3", () => c.claim(aigerim, C3), "NotFunded");
  await step("anyone marks coupon 3 as defaulted", () => c.markDefault(C3), "debt 1 600 000 tKZT public");
  await step("issuer pays the remaining 25%", () => c.fund(issuer, C3, c3 / 4n), "default cured");
  for (const [name, kp] of Object.entries({ aigerim, bolat, fund })) {
    await step(`${name} claims coupon 3`, () => c.claim(kp, C3));
  }

  // --- 12. Maturity: transfers closed, redeem = burn + principal + coupon 4
  await step("issuer funds coupon 4", () => c.fund(issuer, C4, 640_000n * 1_000n));
  await step("issuer funds principal", () => c.fund(issuer, MAT, 8_000_000n * 1_000n));
  await waitUntil(ev(MAT).recordTs.toNumber(), "maturity record date");
  await expectFail("transfer after maturity record date", () => c.transfer(fund, aigerim.publicKey, 1), "TransfersClosed");
  await waitUntil(ev(MAT).payTs.toNumber(), "maturity");
  for (const [name, kp] of Object.entries({ aigerim, bolat, fund })) {
    await step(`${name} redeems (burn + principal + coupon 4)`, () => c.redeem(kp, MAT, C4));
  }

  const final = await c.fetchBond();
  const vault = await getAccount(conn, c.vault);
  console.log(`\nsupply ${final.supply}, reserved ${final.reserved}, vault ${vault.amount}`);
  for (const e of final.events.slice(0, final.eventsLen)) {
    const k = Object.entries(kind).find(([, v]) => v === e.kind)![0];
    console.log(`  #${e.actionId} ${k.padEnd(18)} per unit ${Number(e.amountPerUnit) / 100} funded ${Number(e.funded) / 100} claimed ${Number(e.claimed) / 100}`);
  }

  writeOut(program.programId, c, tkzt, actors, bondId);
}

function writeOut(programId: PublicKey, c: BondClient, tkzt: PublicKey, actors: Record<string, Keypair>, bondId: bigint) {
  fs.mkdirSync(OUT, { recursive: true });
  const out = path.join(OUT, `${SETUP_ONLY ? "setup" : "scenario"}-${bondId}.json`);
  fs.writeFileSync(
    out,
    JSON.stringify(
      {
        program: programId.toBase58(),
        bond: c.bond.toBase58(),
        bondMint: c.bondMint.toBase58(),
        tkzt: tkzt.toBase58(),
        periodSecs: PERIOD,
        actors: Object.fromEntries(Object.entries(actors).map(([k, v]) => [k, v.publicKey.toBase58()])),
        steps: log.map((s) => ({ ...s, url: s.sig ? explorer(s.sig) : undefined })),
      },
      null,
      2,
    ),
  );
  console.log(`\nlog: ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
