// Server-only demo signing: devnet role keys from client/.keys sign on behalf of
// the UI's role switcher. Enabled only with DEMO_SIGNING=1 and never for mainnet.
import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { BondClient, makeProgram } from "./pritok-client";
import { KIND, accruedPerUnit, type BondView, type DemoInfo } from "./view";

const RPC = process.env.RPC_URL ?? "https://api.devnet.solana.com";
const CLUSTER = process.env.NEXT_PUBLIC_CLUSTER ?? "devnet";
const KEYS_DIR = process.env.KEYS_DIR ?? path.resolve(process.cwd(), "../client/.keys");

export const INVESTORS = ["aigerim", "bolat", "fund"] as const;
export type Investor = (typeof INVESTORS)[number];

export const demoEnabled = () => process.env.DEMO_SIGNING === "1" && CLUSTER !== "mainnet-beta";

// On a host without the key files (Vercel), DEMO_KEYS holds {"payer":[...64 bytes], ...}.
const envKeys: Record<string, number[]> | null = process.env.DEMO_KEYS ? JSON.parse(process.env.DEMO_KEYS) : null;

function key(name: string) {
  const bytes = envKeys ? envKeys[name] : JSON.parse(fs.readFileSync(path.join(KEYS_DIR, `${name}.json`), "utf8"));
  if (!bytes) throw new Error(`Demo key "${name}" is missing`);
  return Keypair.fromSecretKey(Uint8Array.from(bytes));
}

let cached: { conn: Connection; keys: Record<string, Keypair> } | null = null;
export function demoContext() {
  return ctx();
}
function ctx() {
  if (!cached) {
    const names = ["payer", "issuer", "operator", ...INVESTORS];
    cached = {
      conn: new Connection(RPC, "confirmed"),
      keys: Object.fromEntries(names.map((n) => [n, key(n)])),
    };
  }
  return cached;
}

/** Actor addresses and their tKZT balances for the role screens. */
export async function demoInfo(bond: BondView): Promise<DemoInfo> {
  if (!demoEnabled()) return { enabled: false };
  const { conn, keys } = ctx();
  const mint = new PublicKey(bond.paymentMint);
  const owners = [keys.issuer, ...INVESTORS.map((i) => keys[i])].map((k) => k.publicKey);
  const atas = owners.map((o) => getAssociatedTokenAddressSync(mint, o, true));
  const infos = await conn.getMultipleAccountsInfo(atas);
  // SPL token account: amount is a u64 at offset 64.
  const bal = infos.map((i) => (i ? Number(i.data.readBigUInt64LE(64)) : 0));
  return {
    enabled: bond.issuer === keys.issuer.publicKey.toBase58(),
    issuer: keys.issuer.publicKey.toBase58(),
    operator: keys.operator.publicKey.toBase58(),
    issuerTkzt: bal[0],
    investors: INVESTORS.map((k, i) => ({ key: k, address: keys[k].publicKey.toBase58(), tkzt: bal[i + 1] })),
  };
}

export type Action =
  | { type: "fund"; actionId: number; amount: number }
  | { type: "markDefault"; actionId: number }
  | { type: "declarePartialRedemption"; couponActionId: number; bps: number }
  | { type: "subscribe"; who: Investor; units: number }
  | { type: "transfer"; who: Investor; to: string; units: number }
  | { type: "claim"; who: Investor; actionId: number }
  | { type: "redeem"; who: Investor }
  | { type: "allow"; owner: string }
  | { type: "claimToBank"; who: Investor; actionId: number }
  | { type: "confirmBank"; owner: string; actionId: number; reference: string }
  | { type: "revoke"; owner: string }
  | { type: "pause"; paused: boolean }
  | { type: "trade"; who: Investor; buyer: Investor; units: number; priceBps: number }
  | { type: "execute"; actionId: number }
  | { type: "bankFor"; owner: string; actionId: number };

export async function perform(bond: BondView, a: Action): Promise<string> {
  const { conn, keys } = ctx();
  const provider = new AnchorProvider(conn, new Wallet(keys.payer), { commitment: "confirmed" });
  const program = makeProgram(provider);
  const issuer = keys.issuer;
  const bondId = (await program.account.bond.fetch(new PublicKey(bond.bond))).bondId;
  const c = new BondClient(program, issuer.publicKey, BigInt(bondId.toString()), new PublicKey(bond.paymentMint));
  if (c.bond.toBase58() !== bond.bond) throw new Error("Этот выпуск создан не демо-эмитентом");
  const inv = (who: Investor) => {
    if (!INVESTORS.includes(who)) throw new Error("Неизвестный инвестор");
    return keys[who];
  };

  switch (a.type) {
    case "fund":
      return c.fund(issuer, a.actionId, BigInt(Math.round(a.amount)));
    case "markDefault":
      return c.markDefault(a.actionId);
    case "declarePartialRedemption":
      return c.declarePartialRedemption(issuer, a.couponActionId, a.bps);
    case "subscribe":
      return c.subscribe(inv(a.who), a.units);
    case "transfer":
      return c.transfer(inv(a.who), new PublicKey(a.to), a.units);
    case "claim":
      return c.claim(inv(a.who), a.actionId);
    case "redeem": {
      const maturity = bond.events.find((e) => e.kind === KIND.MATURITY)!;
      const coupon = bond.events.find((e) => e.kind === KIND.COUPON && e.payTs === maturity.payTs)!;
      return c.redeem(inv(a.who), maturity.actionId, coupon.actionId);
    }
    case "allow":
      return c.allowHolder(keys.operator, new PublicKey(a.owner));
    case "claimToBank":
      return c.claimToBank(inv(a.who), inv(a.who).publicKey, a.actionId, keys.operator.publicKey);
    case "confirmBank": {
      const ref = a.reference.trim();
      if (!ref) throw new Error("Укажите номер платёжного поручения");
      // Only the hash goes onchain; the reference itself stays with the paying agent.
      const hash = [...createHash("sha256").update(ref).digest()];
      return c.confirmBankPayment(keys.operator, new PublicKey(a.owner), a.actionId, hash);
    }
    case "revoke":
      return c.revokeHolder(keys.operator, new PublicKey(a.owner));
    case "pause":
      return BondClient.setPaused(program, keys.operator, a.paused);
    case "execute": {
      // The operator pays every holder of the record date who has not been paid yet.
      const e = bond.events.find((x) => x.actionId === a.actionId);
      if (!e) throw new Error("Неизвестное событие");
      if (e.kind === KIND.MATURITY) {
        // Redemption: the operator pays principal and burns, one holder per transaction.
        const coupon = bond.events.find((x) => x.kind === KIND.COUPON && x.payTs === e.payTs)!;
        const holders = bond.holders.filter((h) => h.balance > 0).map((h) => new PublicKey(h.owner));
        if (!holders.length) throw new Error("Все держатели уже получили выплату");
        let sig = "";
        for (const owner of holders) sig = await c.redeemFor(keys.operator, owner, e.actionId, coupon.actionId);
        return sig;
      }
      const owners = bond.holders
        .filter((h) => (h.unitsAt[e.pos] ?? 0) > 0 && !bond.claims.some((cl) => cl.owner === h.owner && cl.actionId === e.actionId))
        .map((h) => new PublicKey(h.owner));
      if (!owners.length) throw new Error("Все держатели уже получили выплату");
      let sig = "";
      for (let i = 0; i < owners.length; i += 4) sig = await c.payHolders(keys.operator, owners.slice(i, i + 4), e.actionId);
      return sig;
    }
    case "bankFor":
      return c.claimToBank(keys.operator, new PublicKey(a.owner), a.actionId, keys.operator.publicKey);
    case "trade": {
      // Both parties are demo wallets here; in production each signs on its own device.
      const q = accruedPerUnit(bond, bond.now);
      if (!q) throw new Error("Купонов впереди нет — сделки закрыты");
      const perUnit = Math.floor((q.face * a.priceBps) / 10_000) + q.accrued;
      // Accrued interest grows while the transaction is in flight: allow 0.5% on top of the quote.
      const maxTotal = BigInt(Math.ceil(perUnit * a.units * 1.005));
      return c.trade(inv(a.who), inv(a.buyer), a.units, a.priceBps, maxTotal);
    }
  }
}

const ERRORS: Record<string, string> = {
  NotFunded: "Событие профинансировано не полностью — выплаты закрыты",
  NotPayable: "Дата выплаты ещё не наступила",
  OverFunding: "Сумма больше, чем осталось внести",
  CannotDefault: "Дефолт можно зафиксировать только после даты выплаты при нехватке денег",
  NothingToPay: "На дату фиксации у держателя не было облигаций",
  RecordDatePassed: "Дата фиксации этого купона уже прошла",
  TransfersClosed: "После даты фиксации погашения переводы закрыты",
  HolderNotAllowed: "Получатель не допущен регистратором",
  InsufficientBalance: "Недостаточно облигаций",
  SubscriptionClosed: "Подписка закрыта",
  SubscriptionOpen: "Подписка ещё идёт",
  InvalidRedemption: "Недопустимая доля амортизации",
  TooManyEvents: "Достигнут лимит событий выпуска",
  WrongActionKind: "Для этого события нужна другая операция",
  SelfTransfer: "Нельзя перевести самому себе",
  BankSettlement: "Событие проводится через банк",
  Paused: "Операции приостановлены регистратором",
  NotBankRequest: "Эта выплата не ждёт банковского подтверждения",
  EmptyBankRef: "Укажите номер платёжного поручения",
  NotHolderOrOperator: "Запросить выплату в банк может только держатель или регистратор",
  NotOperator: "Действие доступно только регистратору",
  PriceAboveLimit: "Итоговая сумма выше лимита покупателя",
  InvalidPrice: "Цена должна быть больше нуля",
  OperatorRedemptionUnavailable: "Этот выпуск создан до погашения оператором — облигации сдают сами держатели",
};

/** Anchor/RPC error → short Russian message; a repeated claim shows as "already in use". */
export function explain(e: unknown) {
  const text = String((e as Error)?.message ?? e) + JSON.stringify((e as { logs?: string[] })?.logs ?? []);
  const code = text.match(/Error Code: (\w+)/)?.[1];
  if (code && ERRORS[code]) return ERRORS[code];
  if (/already in use/.test(text)) return "Эта выплата уже получена";
  if (code) return code;
  return text.slice(0, 200);
}
