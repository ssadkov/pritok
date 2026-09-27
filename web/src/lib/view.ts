// Plain JSON view of a bond, shared by the API route and the UI. Amounts are in
// payment-token base units (tKZT has 2 decimals), times are chain unix seconds.

export const KIND = { COUPON: 0, PARTIAL_REDEMPTION: 1, MATURITY: 2 } as const;
export const STATUS = { SCHEDULED: 0, FUNDED: 1, DEFAULTED: 2 } as const;
export const MODE = { ONCHAIN: 0, BANK: 1 } as const;
export const CLAIM = { PAID: 0, BANK_REQUESTED: 1, BANK_CONFIRMED: 2 } as const;

export interface EventView {
  pos: number;
  actionId: number;
  kind: number;
  recordTs: number;
  payTs: number;
  factorBpsApplied: number;
  amountPerUnit: number;
  required: number;
  funded: number;
  claimed: number;
  mode: number;
  status: number;
}

export interface HolderView {
  owner: string;
  address: string;
  allowed: boolean;
  balance: number;
  /** Units at each event's record date; null until that record date has passed. */
  unitsAt: (number | null)[];
}

export interface ClaimView {
  address: string;
  owner: string;
  actionId: number;
  units: number;
  amount: number;
  status: number;
  /** Hex of the payment-reference hash, set when the paying agent confirms. */
  bankRefHash: string | null;
}

export interface OpView {
  sig: string;
  time: number;
  name: string;
  actor?: string;
  counterparty?: string;
  units?: number;
  amount?: number;
  actionId?: number;
  ok: boolean;
}

export interface DemoInfo {
  enabled: boolean;
  issuer?: string;
  operator?: string;
  investors?: { key: "aigerim" | "bolat" | "fund"; address: string; tkzt: number }[];
  issuerTkzt?: number;
}

export interface BondView {
  demo?: DemoInfo;
  stale?: boolean;
  cluster: string;
  program: string;
  bond: string;
  bondMint: string;
  paymentMint: string;
  issuer: string;
  now: number;
  faceValue: number;
  couponBps: number;
  factorBps: number;
  periodSecs: number;
  recordOffsetSecs: number;
  startTs: number;
  subscriptionEndTs: number;
  subscriptionClosed: boolean;
  paused: boolean;
  operator: string;
  issuedUnits: number;
  supply: number;
  reserved: number;
  events: EventView[];
  holders: HolderView[];
  claims: ClaimView[];
  ops: OpView[];
}

export const explorerTx = (sig: string, cluster: string) => `https://explorer.solana.com/tx/${sig}?cluster=${cluster}`;
export const explorerAddr = (addr: string, cluster: string) =>
  `https://explorer.solana.com/address/${addr}?cluster=${cluster}`;

/** Base units with 2 decimals → "1 234 567" (kopecks shown only when present). */
export function money(units: number) {
  const whole = Math.trunc(units / 100);
  const frac = Math.abs(units % 100);
  const s = whole.toLocaleString("ru-RU").replace(/ |,/g, " ");
  return frac ? `${s},${String(frac).padStart(2, "0")}` : s;
}

export const count = (n: number) => n.toLocaleString("ru-RU").replace(/ |,/g, " ");
export const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

export function dateTime(ts: number) {
  const d = new Date(ts * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function eventTitle(bond: BondView, e: EventView) {
  if (e.kind === KIND.COUPON) {
    const n = bond.events.filter((x) => x.kind === KIND.COUPON && x.pos <= e.pos).length;
    return `Купон ${n}`;
  }
  if (e.kind === KIND.PARTIAL_REDEMPTION) return `Амортизация ${e.factorBpsApplied / 100}%`;
  return "Погашение";
}

export function eventSubtitle(bond: BondView, e: EventView) {
  const face = (bond.faceValue * e.factorBpsApplied) / 10_000;
  if (e.kind === KIND.COUPON) return `на номинал ${money(face)}`;
  if (e.kind === KIND.PARTIAL_REDEMPTION) return "частичное погашение";
  return `номинал ${money(face)}`;
}

export type UiStatus = "paid" | "paying" | "funded" | "overdue" | "default" | "planned";

export function uiStatus(bond: BondView, e: EventView): UiStatus {
  if (e.status === STATUS.DEFAULTED) return "default";
  if (e.status === STATUS.FUNDED) {
    if (e.claimed >= e.required && e.required > 0) return "paid";
    return bond.now >= e.payTs ? "paying" : "funded";
  }
  if (bond.now >= e.payTs && e.funded < e.required) return "overdue";
  return "planned";
}

export const STATUS_LABEL: Record<UiStatus, string> = {
  paid: "Выплачено",
  paying: "Выплачивается",
  funded: "Профинансировано",
  overdue: "Просрочено",
  default: "Дефолт",
  planned: "Запланировано",
};

/** Current face value: face reduced by partial redemptions already paid out. */
export function currentFace(bond: BondView) {
  const redeemed = bond.events
    .filter((e) => e.kind === KIND.PARTIAL_REDEMPTION && e.payTs <= bond.now)
    .reduce((s, e) => s + e.factorBpsApplied, 0);
  return (bond.faceValue * (10_000 - redeemed)) / 10_000;
}

export function issuerDebt(bond: BondView) {
  return bond.events
    .filter((e) => e.mode === MODE.ONCHAIN && bond.now >= e.payTs && e.funded < e.required)
    .reduce((s, e) => s + (e.required - e.funded), 0);
}

export const totalClaimed = (bond: BondView) => bond.events.reduce((s, e) => s + e.claimed, 0);
