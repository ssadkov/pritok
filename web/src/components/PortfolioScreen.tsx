"use client";

import { useCallback, useEffect, useState } from "react";
import type { PortfolioView } from "@/lib/chain";
import { DEMO_INVESTORS, ISSUER_NAME, label } from "@/lib/demo";
import { calendar, summarize, type CalendarEntry, type EntryState } from "@/lib/portfolio";
import { count, dateTime, explorerAddr, explorerTx, money, short } from "@/lib/view";

const STATE: Record<EntryState, [string, string]> = {
  received: ["Получено", "paid"],
  bank: ["Идёт в банк", "planned"],
  claimable: ["Можно получить", "paid"],
  debt: ["Долг эмитента", "default"],
  expected: ["Ожидается", "planned"],
};

function countdown(sec: number) {
  if (sec <= 0) return "сейчас";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h ? `через ${h} ч ${m} мин` : `через ${m}:${String(s).padStart(2, "0")}`;
}

const bondName = (issuer: string, startTs: number) =>
  `${ISSUER_NAME[issuer] ?? label(issuer)} · выпуск от ${dateTime(startTs).slice(0, 11)}`;

export function PortfolioScreen({ owner, demo }: { owner: string; demo: boolean }) {
  const [pf, setPf] = useState<PortfolioView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState(0);
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; text: string; sig?: string } | null>(null);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [showPast, setShowPast] = useState(false);
  const [showDebt, setShowDebt] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/portfolio/${owner}`, { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setPf(d);
      setFetchedAt(Date.now());
      setError(null);
    } catch (e) {
      setError(String((e as Error).message ?? e));
    }
  }, [owner]);

  useEffect(() => {
    load();
    const t = setInterval(load, 15_000);
    const c = setInterval(() => setTick((x) => x + 1), 1_000);
    return () => {
      clearInterval(t);
      clearInterval(c);
    };
  }, [load]);

  const now = pf ? pf.now + Math.floor((Date.now() - fetchedAt) / 1000) : 0;
  void tick;
  const investorKey = DEMO_INVESTORS.find((i) => i.address === owner)?.key;

  const claim = async (c: CalendarEntry, reload = true) => {
    if (!investorKey) return;
    const id = `${c.bond}-${c.event.actionId}`;
    setBusy(id);
    setToast(null);
    try {
      const r = await fetch(`/api/bond/${c.bond}/act`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "claim", who: investorKey, actionId: c.event.actionId }),
      });
      const d = await r.json();
      setToast(r.ok ? { ok: true, text: `Получено ${money(c.amount)} ₸ — ${c.title}`, sig: d.sig } : { ok: false, text: d.error });
    } finally {
      setBusy(null);
      if (reload) load();
    }
  };
  const claimAll = async (list: CalendarEntry[]) => {
    for (const c of list) await claim(c, false);
    setToast({ ok: true, text: `Получено ${list.length} выплат на ${money(list.reduce((t, c) => t + c.amount, 0))} ₸` });
    load();
  };

  const cal = pf ? calendar({ ...pf, now }) : [];
  const sum = pf ? summarize({ ...pf, now }, cal) : null;
  const claimable = cal.filter((c) => c.state === "claimable");
  const upcoming = cal.filter((c) => c.state === "expected" || c.state === "bank" || c.state === "claimable");
  const debts = cal.filter((c) => c.state === "debt");
  const past = cal.filter((c) => c.state === "received").reverse();
  const held = pf?.positions.filter((p) => p.balance > 0) ?? [];
  const closed = pf?.positions.filter((p) => p.balance === 0) ?? [];

  return (
    <>
      <header className="top">
        <div className="wrap">
          <a className="brand" href="/" style={{ textDecoration: "none" }}>
            <span className="brand-mark" />
            PRITOK<small>реестр и выплаты</small>
          </a>
          <a className="seg-link" href="/bonds">
            Все выпуски
          </a>
          <a className="seg-link" aria-current="page" href={`/portfolio/${owner}`}>
            Портфель
          </a>
          <div className="spacer" />
          <div className="lang">
            KZ · EN · <b>RU</b>
          </div>
        </div>
        <div className="wrap rolebar">
          <div className="role">
            <span className="seg-label">Инвестор</span>
            <div className="seg" role="group" aria-label="Инвестор">
              {DEMO_INVESTORS.map((i) => (
                <a key={i.key} className="seg-link" aria-current={i.address === owner ? "page" : undefined} href={`/portfolio/${i.address}`}>
                  {label(i.address)}
                </a>
              ))}
            </div>
          </div>
          <span className="rolebar-note">{short(owner)}</span>
        </div>
      </header>

      <main className="wrap">
        {!pf || !sum ? (
          <div className="card card-b empty">{error ? `Не удалось загрузить портфель: ${error}` : "Собираем портфель из devnet…"}</div>
        ) : (
          <>
            <section className="card pf-hero">
              <div className="pf-main">
                <div className="muted small">Портфель · {label(owner)}</div>
                <div className="pf-value">{money(sum.value)} ₸</div>
                <div className={`pf-result ${sum.result >= 0 ? "up" : "down"}`}>
                  {sum.result >= 0 ? "+" : "−"}
                  {money(Math.abs(sum.result))} ₸ · {sum.result >= 0 ? "+" : "−"}
                  {Math.abs(sum.resultPct).toFixed(2)}% за всё время
                </div>
                <div className="muted small">Стоимость — облигации по текущему номиналу. Результат = получено + стоимость − вложено.</div>
              </div>
              <div className="pf-stats">
                <div>
                  <div className="l">Вложено</div>
                  <div className="v">{money(sum.invested)} ₸</div>
                </div>
                <div>
                  <div className="l">Получено выплат</div>
                  <div className="v green">{money(sum.received)} ₸</div>
                </div>
                <div>
                  <div className="l">Можно получить сейчас</div>
                  <div className="v">{money(sum.claimableNow)} ₸</div>
                </div>
                <div>
                  <div className="l">Ожидается впереди</div>
                  <div className="v">{money(sum.expected)} ₸</div>
                  {sum.debt > 0 && <div className="red small">+ просрочено эмитентами {money(sum.debt)} ₸</div>}
                </div>
              </div>
            </section>

            {claimable.length > 0 && (
              <section className="card pf-next pf-claim">
                <div>
                  <div className="muted small">Можно получить сейчас</div>
                  <div className="pf-next-amount">{money(sum.claimableNow)} ₸</div>
                  <div>
                    {claimable.length === 1 ? claimable[0].title : `${claimable.length} выплаты`} — деньги уже на счёте выплат выпуска
                  </div>
                </div>
                {demo && investorKey && (
                  <button className="btn" disabled={!!busy} onClick={() => claimAll(claimable)}>
                    {busy ? "Получаем…" : "Получить всё на кошелёк"}
                  </button>
                )}
              </section>
            )}

            {sum.next && (
              <section className="card pf-next">
                <div>
                  <div className="muted small">Ближайшая выплата</div>
                  <div className="pf-next-amount">{money(sum.next.amount)} ₸</div>
                  <div>
                    {sum.next.title} · {bondName(sum.next.position.issuer, sum.next.position.startTs)}
                  </div>
                </div>
                <div className="pf-next-when">
                  <div className="big">{countdown(sum.next.ts - now)}</div>
                  <div className="muted small">{dateTime(sum.next.ts)}</div>
                </div>
              </section>
            )}

            <div className="grid2">
              <section className="card">
                <div className="card-h">
                  <h2>Календарь выплат</h2>
                  <span className="hint">купоны, амортизация и номинал по всем облигациям</span>
                </div>
                <div className="card-b">
                  {upcoming.length === 0 && <div className="empty">Впереди выплат нет</div>}
                  <Timeline entries={upcoming} now={now} busy={busy} onClaim={demo && investorKey ? claim : undefined} cluster={pf.cluster} />
                  {debts.length > 0 && (
                    <>
                      <button className="linkbtn red-link" style={{ marginTop: 12, display: "block" }} onClick={() => setShowDebt(!showDebt)}>
                        {showDebt ? "Скрыть просроченные" : `Просрочено эмитентами · ${debts.length} выплат на ${money(sum.debt)} ₸`}
                      </button>
                      {showDebt && <Timeline entries={debts} now={now} busy={null} cluster={pf.cluster} />}
                    </>
                  )}
                  {past.length > 0 && (
                    <>
                      <button className="linkbtn" style={{ marginTop: 12, display: "block" }} onClick={() => setShowPast(!showPast)}>
                        {showPast ? "Скрыть полученные" : `Полученные выплаты · ${past.length}`}
                      </button>
                      {showPast && <Timeline entries={past} now={now} busy={null} cluster={pf.cluster} />}
                    </>
                  )}
                </div>
              </section>

              <aside className="grid-col">
                <section className="card">
                  <div className="card-h">
                    <h2>Мои облигации</h2>
                  </div>
                  <div className="card-b">
                    {held.length === 0 && <div className="empty">Облигаций сейчас нет</div>}
                    {held.map((p) => {
                      const next = cal.find((c) => c.bond === p.bond && c.state === "expected");
                      const due = cal.filter((c) => c.bond === p.bond && c.state === "claimable").length;
                      const late = cal.filter((c) => c.bond === p.bond && c.state === "debt").length;
                      return (
                        <a key={p.bond} className="holding" href={`/bond/${p.bond}?as=investor${investorKey ? `&who=${investorKey}` : ""}`}>
                          <div>
                            <div className="ev-name">{bondName(p.issuer, p.startTs)}</div>
                            <div className="muted small">
                              {p.couponBps / 100}% · {count(p.balance)} обл.
                              {next ? ` · след. выплата ${money(next.amount)} ₸` : ""}
                            </div>
                          </div>
                          <span className="btns">
                            {due > 0 && <span className="st paid">к получению</span>}
                            {late > 0 && <span className="st default">просрочка</span>}
                            <span className="muted">→</span>
                          </span>
                        </a>
                      );
                    })}
                    {closed.length > 0 && <div className="muted small" style={{ marginTop: 10 }}>Погашено или продано: {closed.length} выпуск(а)</div>}
                  </div>
                </section>

                <section className="card">
                  <div className="card-h">
                    <h2>История операций</h2>
                  </div>
                  <div className="card-b ops">
                    {(showAllHistory ? pf.ops : pf.ops.slice(0, 10)).map((op) => (
                      <div className="op" key={op.sig + op.bond}>
                        <span className="when">{dateTime(op.time)}</span>
                        <span>{describeOp(pf, op)}</span>
                        <a href={explorerTx(op.sig, pf.cluster)} target="_blank" rel="noopener">
                          ↗
                        </a>
                      </div>
                    ))}
                    {pf.ops.length > 10 && (
                      <button className="linkbtn" style={{ marginTop: 10 }} onClick={() => setShowAllHistory(!showAllHistory)}>
                        {showAllHistory ? "Свернуть" : `Показать все ${pf.ops.length}`}
                      </button>
                    )}
                  </div>
                </section>
              </aside>
            </div>
            <footer>
              <span>PRITOK — независимый прототип для трека Superteam Kazakhstan × KASE. Не аффилирован с KASE.</span>
              <a className="addr" href={explorerAddr(owner, pf.cluster)} target="_blank" rel="noopener">
                кошелёк {short(owner)} ↗
              </a>
            </footer>
          </>
        )}
      </main>
      {toast && (
        <div className={`toast ${toast.ok ? "ok" : "err"}`} role="status">
          <div>
            <b>{toast.ok ? "Готово" : "Отклонено"}</b> · {toast.text}
          </div>
          {toast.sig && pf && (
            <a href={explorerTx(toast.sig, pf.cluster)} target="_blank" rel="noopener">
              транзакция ↗
            </a>
          )}
          <button onClick={() => setToast(null)} aria-label="Закрыть">
            ×
          </button>
        </div>
      )}
    </>
  );
}

function Timeline({
  entries,
  now,
  busy,
  onClaim,
  cluster,
}: {
  entries: CalendarEntry[];
  now: number;
  busy: string | null;
  onClaim?: (c: CalendarEntry) => void;
  cluster: string;
}) {
  let lastDay = "";
  return (
    <div className="pf-cal">
      {entries.map((c) => {
        const day = dateTime(c.ts).slice(0, 5);
        const header = day !== lastDay ? day : null;
        lastDay = day;
        const [text, cls] = STATE[c.state];
        const id = `${c.bond}-${c.event.actionId}`;
        return (
          <div key={id}>
            {header && <div className="pf-day">{header}</div>}
            <div className={`pf-item ${c.state}`}>
              <span className="when">{dateTime(c.ts).slice(6)}</span>
              <div>
                <div className="ev-name">{c.title}</div>
                <div className="muted small">
                  {bondName(c.position.issuer, c.position.startTs)} · {count(c.units)} обл.
                  {c.state === "expected" && ` · ${countdown(c.ts - now)}`}
                </div>
              </div>
              <div className="pf-amount">
                <b>{money(c.amount)} ₸</b>
                {c.state === "claimable" && onClaim ? (
                  <button className="btn small-btn" disabled={!!busy} onClick={() => onClaim(c)}>
                    {busy === id ? "…" : "Получить"}
                  </button>
                ) : c.claimAddress ? (
                  <a className={`st ${cls}`} href={explorerAddr(c.claimAddress, cluster)} target="_blank" rel="noopener">
                    {text} ↗
                  </a>
                ) : (
                  <span className={`st ${cls}`}>{text}</span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function describeOp(pf: PortfolioView, op: PortfolioView["ops"][number]) {
  const p = pf.positions.find((x) => x.bond === op.bond);
  const name = p ? bondName(p.issuer, p.startTs) : short(op.bond);
  const ev = p?.events.find((e) => e.actionId === op.actionId);
  const evTitle = ev && p ? ` «${ev.kind === 2 ? "Погашение" : ev.kind === 1 ? "Амортизация" : "Купон"}»` : "";
  switch (op.name) {
    case "subscribe":
      return `Покупка при размещении: ${count(op.units ?? 0)} обл. × ${money(p?.faceValue ?? 0)} ₸ · ${name}`;
    case "trade_dvp":
      return op.actor === pf.owner
        ? `Продажа ${count(op.units ?? 0)} обл. → ${label(op.counterparty ?? "")}${op.amount !== undefined ? ` за ${money(op.amount)} ₸` : ""} · ${name}`
        : `Покупка ${count(op.units ?? 0)} обл. у ${label(op.actor ?? "")}${op.amount !== undefined ? ` за ${money(op.amount)} ₸` : ""} · ${name}`;
    case "transfer_bond":
      return op.actor === pf.owner
        ? `Перевод ${count(op.units ?? 0)} обл. → ${label(op.counterparty ?? "")} · ${name}`
        : `Получено ${count(op.units ?? 0)} обл. от ${label(op.actor ?? "")} · ${name}`;
    case "claim":
      return `Выплата${evTitle} на кошелёк · ${name}`;
    case "claim_to_bank":
      return `Выплата${evTitle} через банк · ${name}`;
    case "confirm_bank_payment":
      return `Банк подтвердил выплату${evTitle} · ${name}`;
    case "redeem":
      return `Погашение: облигации сданы, номинал получен · ${name}`;
    case "allow_holder":
      return `Допуск регистратора · ${name}`;
    case "revoke_holder":
      return `Допуск отозван · ${name}`;
    default:
      return `${op.name} · ${name}`;
  }
}
