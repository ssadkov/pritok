// Server-only: reads a bond and its history from Solana and builds a BondView.
import { BorshInstructionCoder, Program, type Idl } from "@coral-xyz/anchor";
import { Connection, PublicKey, type ParsedTransactionWithMeta } from "@solana/web3.js";
import idl from "@/idl/pritok.json";
import type { Pritok } from "@/idl/pritok";
import type { BondView, ClaimView, EventView, HolderView, OpView } from "./view";

export const CLUSTER = process.env.NEXT_PUBLIC_CLUSTER ?? "devnet";
const RPC = process.env.RPC_URL ?? "https://api.devnet.solana.com";
const connection = new Connection(RPC, "confirmed");
const program = new Program<Pritok>(idl as Pritok, { connection });
const coder = new BorshInstructionCoder(idl as Idl);

const num = (v: { toNumber(): number } | number) => (typeof v === "number" ? v : v.toNumber());

async function chainTime() {
  const slot = await connection.getSlot();
  return (await connection.getBlockTime(slot)) ?? Math.floor(Date.now() / 1000);
}

// Transactions are immutable: decode each signature once per server process.
const opCache = new Map<string, OpView | null>();

function decodeOp(sig: string, tx: ParsedTransactionWithMeta | null): OpView | null {
  if (!tx) return null;
  const ix = tx.transaction.message.instructions.find((i) => i.programId.equals(program.programId));
  if (!ix || !("data" in ix)) return null;
  const decoded = coder.decode(ix.data, "base58");
  if (!decoded) return null;
  const acc = ix.accounts.map((a) => a.toBase58());
  const d = decoded.data as Record<string, { toNumber?: () => number } | number>;
  const n = (k: string) => (d[k] === undefined ? undefined : num(d[k] as never));
  const base = { sig, time: tx.blockTime ?? 0, name: decoded.name, ok: !tx.meta?.err };
  switch (decoded.name) {
    case "subscribe":
      return { ...base, actor: acc[0], units: n("units") };
    case "transfer_bond":
      return { ...base, actor: acc[0], counterparty: acc[1], units: n("units") };
    case "claim":
      return { ...base, actor: acc[0], actionId: n("action_id") };
    case "redeem":
      return { ...base, actor: acc[0] };
    case "fund_action":
      return { ...base, actor: acc[0], actionId: n("action_id"), amount: n("amount") };
    case "declare_partial_redemption":
      return { ...base, actor: acc[0], actionId: n("coupon_action_id") };
    case "mark_default":
      return { ...base, actionId: n("action_id") };
    case "allow_holder":
      return { ...base, actor: acc[3] };
    case "claim_to_bank":
      return { ...base, actor: acc[0], counterparty: acc[1], actionId: n("action_id") };
    case "confirm_bank_payment":
      return { ...base, actor: acc[0], counterparty: acc[3], actionId: n("action_id") };
    case "revoke_holder":
      return { ...base, actor: acc[0], counterparty: acc[2] };
    default:
      return base;
  }
}

// Public devnet RPC rejects batched getTransactions: fetch a couple at a time,
// cache forever, and let a failed history refresh fall back to what is cached.
const HISTORY_CONCURRENCY = 2;
const knownSigs = new Map<string, string[]>();

async function history(bond: PublicKey): Promise<OpView[]> {
  const key = bond.toBase58();
  try {
    const sigs = await connection.getSignaturesForAddress(bond, { limit: 200 });
    knownSigs.set(key, sigs.filter((s) => !s.err).map((s) => s.signature));
    const missing = knownSigs.get(key)!.filter((s) => !opCache.has(s));
    for (let i = 0; i < missing.length; i += HISTORY_CONCURRENCY) {
      const batch = missing.slice(i, i + HISTORY_CONCURRENCY);
      const txs = await Promise.all(
        batch.map((sig) => connection.getParsedTransaction(sig, { maxSupportedTransactionVersion: 0 })),
      );
      // A null response means the node has not indexed the tx yet: retry on the next poll.
      batch.forEach((sig, j) => txs[j] && opCache.set(sig, decodeOp(sig, txs[j])));
    }
  } catch (e) {
    console.warn(`history for ${key}: ${(e as Error).message}`);
  }
  return (knownSigs.get(key) ?? [])
    .map((s) => opCache.get(s))
    .filter((o): o is OpView => !!o && o.ok)
    .sort((a, b) => a.time - b.time);
}

// Several open tabs polling every few seconds share one chain read.
const VIEW_TTL_MS = 3_000;
const viewCache = new Map<string, { at: number; view: Promise<BondView> }>();

const lastGood = new Map<string, BondView>();

/** Drops the short-lived cache so the next read reflects a just-sent transaction. */
export function invalidate(address: string) {
  viewCache.delete(address);
}

/** Returns fresh data, or the last successful read (marked stale) when the RPC is rate-limited. */
export async function loadBond(address: string): Promise<BondView & { stale?: boolean }> {
  const hit = viewCache.get(address);
  let view = hit && Date.now() - hit.at < VIEW_TTL_MS ? hit.view : undefined;
  if (!view) {
    view = readBond(address);
    viewCache.set(address, { at: Date.now(), view });
  }
  try {
    const v = await view;
    lastGood.set(address, v);
    return v;
  } catch (e) {
    viewCache.delete(address);
    const prev = lastGood.get(address);
    if (prev) return { ...prev, stale: true };
    throw e;
  }
}

async function readBond(address: string): Promise<BondView> {
  const bondKey = new PublicKey(address);
  const configKey = PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId)[0];
  const [b, now, holderAccs, claimAccs, ops, config] = await Promise.all([
    program.account.bond.fetch(bondKey),
    chainTime(),
    program.account.holder.all([{ memcmp: { offset: 8, bytes: bondKey.toBase58() } }]),
    program.account.claim.all([{ memcmp: { offset: 8, bytes: bondKey.toBase58() } }]),
    history(bondKey),
    program.account.config.fetch(configKey),
  ]);

  const issuedUnits = num(b.issuedUnits);
  const events: EventView[] = b.events.slice(0, b.eventsLen).map((e, pos) => ({
    pos,
    actionId: e.actionId,
    kind: e.kind,
    recordTs: num(e.recordTs),
    payTs: num(e.payTs),
    factorBpsApplied: e.factorBpsApplied,
    amountPerUnit: num(e.amountPerUnit),
    required: num(e.amountPerUnit) * issuedUnits,
    funded: num(e.funded),
    claimed: num(e.claimed),
    mode: e.mode,
    status: e.status,
  }));

  // Same rule as Holder::units_at in the program.
  const holders: HolderView[] = holderAccs.map(({ publicKey, account: h }) => ({
    owner: h.owner.toBase58(),
    address: publicKey.toBase58(),
    allowed: h.allowed,
    balance: num(h.balance),
    unitsAt: events.map((e) =>
      e.recordTs > now ? null : e.pos < h.syncedUpto ? num(h.balAt[e.pos]) : num(h.balance),
    ),
  }));

  const claims: ClaimView[] = claimAccs.map(({ publicKey, account: c }) => ({
    address: publicKey.toBase58(),
    owner: c.owner.toBase58(),
    actionId: c.actionId,
    units: num(c.units),
    amount: num(c.amount),
    status: c.status,
    bankRefHash: c.bankRefHash.some((x) => x !== 0) ? Buffer.from(c.bankRefHash).toString("hex") : null,
  }));

  return {
    cluster: CLUSTER,
    program: program.programId.toBase58(),
    bond: address,
    bondMint: b.bondMint.toBase58(),
    paymentMint: b.paymentMint.toBase58(),
    issuer: b.issuer.toBase58(),
    now,
    faceValue: num(b.faceValue),
    couponBps: b.couponBps,
    factorBps: b.factorBps,
    periodSecs: num(b.periodSecs),
    recordOffsetSecs: num(b.recordOffsetSecs),
    startTs: num(b.startTs),
    subscriptionEndTs: num(b.subscriptionEndTs),
    subscriptionClosed: b.subscriptionClosed,
    paused: config.paused,
    operator: config.operator.toBase58(),
    issuedUnits,
    supply: num(b.supply),
    reserved: num(b.reserved),
    events,
    holders,
    claims,
    ops,
  };
}
