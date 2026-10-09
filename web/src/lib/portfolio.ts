// Investor-side numbers from onchain data: what was invested, what came back, what is ahead.
import type { PortfolioView, PositionView } from "./chain";
import { ruT, type T } from "./i18n-core";
import { CLAIM, KIND, STATUS, eventTitle, type BondView, type EventView } from "./view";

/** eventTitle and friends take a BondView; a position has everything they read. */
export const asBond = (p: PositionView) => p as unknown as BondView;

export type EntryState = "received" | "bank" | "claimable" | "debt" | "expected";

export interface CalendarEntry {
  bond: string;
  position: PositionView;
  event: EventView;
  title: string;
  ts: number;
  units: number;
  amount: number;
  state: EntryState;
  claimAddress?: string;
}

/** Face value outstanding for the period that contains `now`. */
function faceNow(p: PositionView, now: number) {
  const next = p.events.find((e) => e.kind !== KIND.PARTIAL_REDEMPTION && e.payTs > now);
  const factor = next ? next.factorBpsApplied : p.events[p.events.length - 1]?.factorBpsApplied ?? 10_000;
  return Math.floor((p.faceValue * factor) / 10_000);
}

export function calendar(pf: PortfolioView, t: T = ruT): CalendarEntry[] {
  const out: CalendarEntry[] = [];
  for (const p of pf.positions) {
    for (const e of p.events) {
      const recorded = p.unitsAt[e.pos];
      const units = recorded ?? p.balance;
      if (!units) continue;
      const claim = pf.claims.find((c) => c.bond === p.bond && c.actionId === e.actionId);
      let state: EntryState;
      if (claim) state = claim.status === CLAIM.BANK_REQUESTED ? "bank" : "received";
      else if (pf.now < e.payTs) state = "expected";
      else if (e.status === STATUS.FUNDED) state = "claimable";
      else state = "debt";
      out.push({
        bond: p.bond,
        position: p,
        event: e,
        title: eventTitle(asBond(p), e, t),
        ts: e.payTs,
        units: claim ? claim.units : units,
        amount: claim ? claim.amount : units * e.amountPerUnit,
        state,
        claimAddress: claim?.address,
      });
    }
  }
  return out.sort((a, b) => a.ts - b.ts);
}

export interface Summary {
  invested: number;
  received: number;
  claimableNow: number;
  expected: number;
  debt: number;
  value: number;
  result: number;
  resultPct: number;
  next?: CalendarEntry;
}

export function summarize(pf: PortfolioView, cal: CalendarEntry[]): Summary {
  let invested = 0;
  for (const op of pf.ops) {
    const p = pf.positions.find((x) => x.bond === op.bond);
    if (!p) continue;
    if (op.name === "subscribe" && op.actor === pf.owner) invested += (op.units ?? 0) * p.faceValue;
    if (op.name === "trade_dvp" && op.amount !== undefined) {
      if (op.counterparty === pf.owner) invested += op.amount; // bought
      if (op.actor === pf.owner) invested -= op.amount; // sold
    }
  }
  const sum = (s: EntryState[]) => cal.filter((c) => s.includes(c.state)).reduce((t, c) => t + c.amount, 0);
  const received = sum(["received", "bank"]);
  const value = pf.positions.reduce((t, p) => t + p.balance * faceNow(p, pf.now), 0);
  const result = received + value - invested;
  return {
    invested,
    received,
    claimableNow: sum(["claimable"]),
    expected: sum(["expected"]),
    debt: sum(["debt"]),
    value,
    result,
    resultPct: invested ? (result / invested) * 100 : 0,
    next: cal.find((c) => c.state === "expected"),
  };
}
