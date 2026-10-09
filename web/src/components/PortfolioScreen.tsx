"use client";

import { useCallback, useEffect, useState } from "react";
import type { PortfolioView } from "@/lib/chain";
import { DEMO_INVESTORS, issuerOf, nameOf } from "@/lib/demo";
import { LangSwitch, useT } from "@/lib/i18n";
import type { T } from "@/lib/i18n-core";
import { calendar, summarize, type CalendarEntry, type EntryState } from "@/lib/portfolio";
import { count, dateTime, explorerAddr, explorerTx, money, short } from "@/lib/view";

const STATE: Record<EntryState, [string, string]> = {
  received: ["Получено", "paid"],
  bank: ["Идёт в банк", "planned"],
  claimable: ["Можно получить", "paid"],
  debt: ["Долг эмитента", "default"],
  expected: ["Ожидается", "planned"],
};

function countdown(sec: number, t: T) {
  if (sec <= 0) return t("сейчас");
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h ? t("через {h} ч {m} мин", { h, m }) : t("через {mmss}", { mmss: `${m}:${String(s).padStart(2, "0")}` });
}

const bondName = (issuer: string, startTs: number, t: T) =>
  `${issuerOf(issuer, t)} · ${t("выпуск от {date}", { date: dateTime(startTs).slice(0, 11) })}`;

export function PortfolioScreen({ owner, demo }: { owner: string; demo: boolean }) {
  const t = useT();
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
      setToast(
        r.ok
          ? { ok: true, text: t("Получено {amount} ₸ — {event}", { amount: money(c.amount), event: c.title }), sig: d.sig }
          : { ok: false, text: t(d.error) },
      );
    } finally {
      setBusy(null);
      if (reload) load();
    }
  };
  const claimAll = async (list: CalendarEntry[]) => {
    for (const c of list) await claim(c, false);
    setToast({
      ok: true,
      text: t("Получено {n} выплат на {amount} ₸", { n: list.length, amount: money(list.reduce((s, c) => s + c.amount, 0)) }),
    });
    load();
  };

  const cal = pf ? calendar({ ...pf, now }, t) : [];
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
            PRITOK<small>{t("реестр и выплаты")}</small>
          </a>
          <a className="seg-link" href="/bonds">
            {t("Все выпуски")}
          </a>
          <a className="seg-link" aria-current="page" href={`/portfolio/${owner}`}>
            {t("Портфель")}
          </a>
          <div className="spacer" />
          <LangSwitch />
        </div>
        <div className="wrap rolebar">
          <div className="role">
            <span className="seg-label">{t("Инвестор")}</span>
            <div className="seg" role="group" aria-label={t("Инвестор")}>
              {DEMO_INVESTORS.map((i) => (
                <a key={i.key} className="seg-link" aria-current={i.address === owner ? "page" : undefined} href={`/portfolio/${i.address}`}>
                  {nameOf(i.address, t)}
                </a>
              ))}
            </div>
          </div>
          <span className="rolebar-note">{short(owner)}</span>
        </div>
      </header>

      <main className="wrap">
        {!pf || !sum ? (
          <div className="card card-b empty">
            {error ? t("Не удалось загрузить портфель: {error}", { error: t(error) }) : t("Собираем портфель из devnet…")}
          </div>
        ) : (
          <>
            <section className="card pf-hero">
              <div className="pf-main">
                <div className="muted small">
                  {t("Портфель")} · {nameOf(owner, t)}
                </div>
                <div className="pf-value">{money(sum.value)} ₸</div>
                <div className={`pf-result ${sum.result >= 0 ? "up" : "down"}`}>
                  {sum.result >= 0 ? "+" : "−"}
                  {money(Math.abs(sum.result))} ₸ · {sum.result >= 0 ? "+" : "−"}
                  {Math.abs(sum.resultPct).toFixed(2)}% {t("за всё время")}
                </div>
                <div className="muted small">{t("Стоимость — облигации по текущему номиналу. Результат = получено + стоимость − вложено.")}</div>
              </div>
              <div className="pf-stats">
                <div>
                  <div className="l">{t("Вложено")}</div>
                  <div className="v">{money(sum.invested)} ₸</div>
                </div>
                <div>
                  <div className="l">{t("Получено выплат")}</div>
                  <div className="v green">{money(sum.received)} ₸</div>
                </div>
                <div>
                  <div className="l">{t("Можно получить сейчас")}</div>
                  <div className="v">{money(sum.claimableNow)} ₸</div>
                </div>
                <div>
                  <div className="l">{t("Ожидается впереди")}</div>
                  <div className="v">{money(sum.expected)} ₸</div>
                  {sum.debt > 0 && <div className="red small">{t("+ просрочено эмитентами {amount} ₸", { amount: money(sum.debt) })}</div>}
                </div>
              </div>
            </section>

            {claimable.length > 0 && (
              <section className="card pf-next pf-claim">
                <div>
                  <div className="muted small">{t("Можно получить сейчас")}</div>
                  <div className="pf-next-amount">{money(sum.claimableNow)} ₸</div>
                  <div>
                    {claimable.length === 1 ? claimable[0].title : t("{n} выплаты", { n: claimable.length })} —{" "}
                    {t("деньги уже на счёте выплат выпуска")}
                  </div>
                </div>
                {demo && investorKey && (
                  <button className="btn" disabled={!!busy} onClick={() => claimAll(claimable)}>
                    {busy ? t("Получаем…") : t("Получить всё на кошелёк")}
                  </button>
                )}
              </section>
            )}

            {sum.next && (
              <section className="card pf-next">
                <div>
                  <div className="muted small">{t("Ближайшая выплата")}</div>
                  <div className="pf-next-amount">{money(sum.next.amount)} ₸</div>
                  <div>
                    {sum.next.title} · {bondName(sum.next.position.issuer, sum.next.position.startTs, t)}
                  </div>
                </div>
                <div className="pf-next-when">
                  <div className="big">{countdown(sum.next.ts - now, t)}</div>
                  <div className="muted small">{dateTime(sum.next.ts)}</div>
                </div>
              </section>
            )}

            <div className="grid2">
              <section className="card">
                <div className="card-h">
                  <h2>{t("Календарь выплат")}</h2>
                  <span className="hint">{t("купоны, амортизация и номинал по всем облигациям")}</span>
                </div>
                <div className="card-b">
                  {upcoming.length === 0 && <div className="empty">{t("Впереди выплат нет")}</div>}
                  <Timeline entries={upcoming} now={now} busy={busy} onClaim={demo && investorKey ? claim : undefined} cluster={pf.cluster} />
                  {debts.length > 0 && (
                    <>
                      <button className="linkbtn red-link" style={{ marginTop: 12, display: "block" }} onClick={() => setShowDebt(!showDebt)}>
                        {showDebt
                          ? t("Скрыть просроченные")
                          : t("Просрочено эмитентами · {n} выплат на {amount} ₸", { n: debts.length, amount: money(sum.debt) })}
                      </button>
                      {showDebt && <Timeline entries={debts} now={now} busy={null} cluster={pf.cluster} />}
                    </>
                  )}
                  {past.length > 0 && (
                    <>
                      <button className="linkbtn" style={{ marginTop: 12, display: "block" }} onClick={() => setShowPast(!showPast)}>
                        {showPast ? t("Скрыть полученные") : t("Полученные выплаты · {n}", { n: past.length })}
                      </button>
                      {showPast && <Timeline entries={past} now={now} busy={null} cluster={pf.cluster} />}
                    </>
                  )}
                </div>
              </section>

              <aside className="grid-col">
                <section className="card">
                  <div className="card-h">
                    <h2>{t("Мои облигации")}</h2>
                  </div>
                  <div className="card-b">
                    {held.length === 0 && <div className="empty">{t("Облигаций сейчас нет")}</div>}
                    {held.map((p) => {
                      const next = cal.find((c) => c.bond === p.bond && c.state === "expected");
                      const due = cal.filter((c) => c.bond === p.bond && c.state === "claimable").length;
                      const late = cal.filter((c) => c.bond === p.bond && c.state === "debt").length;
                      return (
                        <a key={p.bond} className="holding" href={`/bond/${p.bond}?as=investor${investorKey ? `&who=${investorKey}` : ""}`}>
                          <div>
                            <div className="ev-name">{bondName(p.issuer, p.startTs, t)}</div>
                            <div className="muted small">
                              {p.couponBps / 100}% · {t("{n} обл.", { n: count(p.balance) })}
                              {next ? ` · ${t("след. выплата {amount} ₸", { amount: money(next.amount) })}` : ""}
                            </div>
                          </div>
                          <span className="btns">
                            {due > 0 && <span className="st paid">{t("к получению")}</span>}
                            {late > 0 && <span className="st default">{t("просрочка")}</span>}
                            <span className="muted">→</span>
                          </span>
                        </a>
                      );
                    })}
                    {closed.length > 0 && (
                      <div className="muted small" style={{ marginTop: 10 }}>
                        {t("Погашено или продано: {n} выпуск(а)", { n: closed.length })}
                      </div>
                    )}
                  </div>
                </section>

                <section className="card">
                  <div className="card-h">
                    <h2>{t("История операций")}</h2>
                  </div>
                  <div className="card-b ops">
                    {(showAllHistory ? pf.ops : pf.ops.slice(0, 10)).map((op) => (
                      <div className="op" key={op.sig + op.bond}>
                        <span className="when">{dateTime(op.time)}</span>
                        <span>{describeOp(pf, op, t)}</span>
                        <a href={explorerTx(op.sig, pf.cluster)} target="_blank" rel="noopener">
                          ↗
                        </a>
                      </div>
                    ))}
                    {pf.ops.length > 10 && (
                      <button className="linkbtn" style={{ marginTop: 10 }} onClick={() => setShowAllHistory(!showAllHistory)}>
                        {showAllHistory ? t("Свернуть") : t("Показать все {n}", { n: pf.ops.length })}
                      </button>
                    )}
                  </div>
                </section>
              </aside>
            </div>
            <footer>
              <span>{t("PRITOK — независимый прототип для трека Superteam Kazakhstan × KASE. Не аффилирован с KASE.")}</span>
              <a className="addr" href={explorerAddr(owner, pf.cluster)} target="_blank" rel="noopener">
                {t("кошелёк")} {short(owner)} ↗
              </a>
            </footer>
          </>
        )}
      </main>
      {toast && (
        <div className={`toast ${toast.ok ? "ok" : "err"}`} role="status">
          <div>
            <b>{toast.ok ? t("Готово") : t("Отклонено")}</b> · {toast.text}
          </div>
          {toast.sig && pf && (
            <a href={explorerTx(toast.sig, pf.cluster)} target="_blank" rel="noopener">
              {t("транзакция")} ↗
            </a>
          )}
          <button onClick={() => setToast(null)} aria-label={t("Закрыть")}>
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
  const t = useT();
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
                  {bondName(c.position.issuer, c.position.startTs, t)} · {t("{n} обл.", { n: count(c.units) })}
                  {c.state === "expected" && ` · ${countdown(c.ts - now, t)}`}
                </div>
              </div>
              <div className="pf-amount">
                <b>{money(c.amount)} ₸</b>
                {c.state === "claimable" && onClaim ? (
                  <button className="btn small-btn" disabled={!!busy} onClick={() => onClaim(c)}>
                    {busy === id ? "…" : t("Получить")}
                  </button>
                ) : c.claimAddress ? (
                  <a className={`st ${cls}`} href={explorerAddr(c.claimAddress, cluster)} target="_blank" rel="noopener">
                    {t(text)} ↗
                  </a>
                ) : (
                  <span className={`st ${cls}`}>{t(text)}</span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function describeOp(pf: PortfolioView, op: PortfolioView["ops"][number], t: T) {
  const p = pf.positions.find((x) => x.bond === op.bond);
  const name = p ? bondName(p.issuer, p.startTs, t) : short(op.bond);
  const ev = p?.events.find((e) => e.actionId === op.actionId);
  const event = ev ? ` «${t(ev.kind === 2 ? "Погашение" : ev.kind === 1 ? "Амортизация" : "Купон")}»` : "";
  const n = count(op.units ?? 0);
  const amount = op.amount !== undefined ? t(" за {amount} ₸", { amount: money(op.amount) }) : "";
  switch (op.name) {
    case "subscribe":
      return t("Покупка при размещении: {n} обл. × {face} ₸ · {name}", { n, face: money(p?.faceValue ?? 0), name });
    case "trade_dvp":
      return op.actor === pf.owner
        ? t("Продажа {n} обл. → {to}{amount} · {name}", { n, to: nameOf(op.counterparty ?? "", t), amount, name })
        : t("Покупка {n} обл. у {from}{amount} · {name}", { n, from: nameOf(op.actor ?? "", t), amount, name });
    case "transfer_bond":
      return op.actor === pf.owner
        ? t("Перевод {n} обл. → {to} · {name}", { n, to: nameOf(op.counterparty ?? "", t), name })
        : t("Получено {n} обл. от {from} · {name}", { n, from: nameOf(op.actor ?? "", t), name });
    case "claim":
      return t("Выплата{event} на кошелёк · {name}", { event, name });
    case "claim_to_bank":
      return t("Выплата{event} через банк · {name}", { event, name });
    case "confirm_bank_payment":
      return t("Банк подтвердил выплату{event} · {name}", { event, name });
    case "redeem":
      return t("Погашение: облигации сданы, номинал получен · {name}", { name });
    case "allow_holder":
      return t("Допуск регистратора · {name}", { name });
    case "revoke_holder":
      return t("Допуск отозван · {name}", { name });
    default:
      return `${op.name} · ${name}`;
  }
}
