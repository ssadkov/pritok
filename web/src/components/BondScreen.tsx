"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { nextStep } from "@/lib/next-step";
import { LangSwitch, useT } from "@/lib/i18n";
import { ruPlural, type T } from "@/lib/i18n-core";
import { NewBondButton } from "./NewBondButton";
import { executionRows } from "./OperatorConsole";
import { Term, startTour, useFirstVisitTour } from "./Tour";
import { InvestorPanel, IssuerPanel, OperatorPanel, Toast, useAct, type Role } from "./RolePanels";
import { colorFor, issuerOf, nameOf } from "@/lib/demo";
import {
  CLAIM,
  KIND,
  STATUS_LABEL,
  count,
  currentFace,
  dateTime,
  eventSubtitle,
  eventTitle,
  explorerAddr,
  explorerTx,
  issuerDebt,
  money,
  short,
  totalClaimed,
  uiStatus,
  type BondView,
  type EventView,
  type OpView,
} from "@/lib/view";

const POLL_MS = 10_000;

function useBond(address: string) {
  const [bond, setBond] = useState<BondView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState(0);
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((n) => n + 1), []);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch(`/api/bond/${address}`, { cache: "no-store" });
        const data = await res.json();
        if (!alive) return;
        if (!res.ok) throw new Error(data.error ?? res.statusText);
        setBond(data);
        setFetchedAt(Date.now());
        setError(null);
      } catch (e) {
        if (alive) setError(String((e as Error).message ?? e));
      }
    };
    load();
    const t = setInterval(load, POLL_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [address, nonce]);
  return { bond, error, fetchedAt, reload };
}

/** Chain time advanced locally between polls, so countdowns tick every second. */
function useNow(bond: BondView | null, fetchedAt: number) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 1_000);
    return () => clearInterval(t);
  }, []);
  if (!bond) return 0;
  void tick;
  return bond.now + Math.floor((Date.now() - fetchedAt) / 1000);
}

export function BondScreen({ address }: { address: string }) {
  const t = useT();
  const { bond, error, fetchedAt, reload } = useBond(address);
  const now = useNow(bond, fetchedAt);
  const [selected, setSelected] = useState<number | null>(null);
  const [role, setRoleState] = useState<Role>("public");
  const [who, setWhoState] = useState<"aigerim" | "bolat" | "fund">("aigerim");
  const a = useAct(address, reload);
  useFirstVisitTour(!!bond, t);

  // Role and investor live in the URL (?as=investor&who=bolat) so a view can be shared.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const r = q.get("as");
    if (r === "issuer" || r === "operator" || r === "investor") setRoleState(r);
    const w = q.get("who");
    if (w === "aigerim" || w === "bolat" || w === "fund") setWhoState(w);
  }, []);
  const syncUrl = (r: Role, w: string) => {
    const q = new URLSearchParams(window.location.search);
    q.delete("as");
    q.delete("who");
    if (r !== "public") q.set("as", r);
    if (r === "investor") q.set("who", w);
    const qs = q.toString();
    window.history.replaceState(null, "", window.location.pathname + (qs ? "?" + qs : ""));
  };
  const setRole = (r: Role) => {
    setRoleState(r);
    syncUrl(r, who);
  };
  const setWho = (w: "aigerim" | "bolat" | "fund") => {
    setWhoState(w);
    syncUrl(role, w);
  };

  if (!bond) {
    return (
      <>
        <TopBar bond={null} now={0} stale={!!error} role="public" setRole={() => {}} />
        <main className="wrap">
          <div className="card card-b empty">
            {error ? t("Не удалось загрузить выпуск: {error}", { error: t(error) }) : t("Загружаем выпуск из devnet…")}
          </div>
        </main>
      </>
    );
  }

  const demo = !!bond.demo?.enabled;
  const defaultPos = pickDefaultEvent(bond);
  const pos = selected ?? defaultPos;

  return (
    <>
      <TopBar bond={bond} now={now} stale={!!error || !!bond.stale} role={demo ? role : "public"} setRole={setRole} />
      <main className="wrap">
        {demo && bond.supply === 0 && bond.subscriptionClosed && (
          <div className="card banner">
            <div>
              <b>{t("Этот выпуск уже погашен.")}</b>{" "}
              {t("Кнопки ролей работают на живом выпуске — запустите новый: он будет создан, размещён среди трёх инвесторов и пройдёт весь цикл примерно за 17 минут.")}
            </div>
            <NewBondButton />
          </div>
        )}
        <NextStepBar
          bond={bond}
          now={now}
          demo={demo}
          onGo={(r, w) => {
            if (w) setWho(w);
            setRole(r);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
        <BondHeader bond={bond} />
        {demo && role === "issuer" && <IssuerPanel bond={bond} a={a} />}
        {demo && role === "investor" && <InvestorPanel bond={bond} a={a} who={who} setWho={setWho} />}
        {demo && role === "operator" && <OperatorPanel bond={bond} a={a} />}
        <Timeline bond={bond} now={now} selected={pos} onSelect={setSelected} />
        <div className="grid2">
          <EventsTable bond={bond} selected={pos} onSelect={setSelected} />
          <aside className="card calc" aria-live="polite" data-tour="calc">
            <div className="card-b">
              <CalcPanel
                bond={bond}
                event={bond.events[pos]}
                busy={!!a.busy}
                onDefault={
                  demo
                    ? (actionId) => a.act("default-" + actionId, t("Технический дефолт зафиксирован"), { type: "markDefault", actionId })
                    : undefined
                }
              />
            </div>
          </aside>
        </div>
        <Registry bond={bond} />
        <Journal bond={bond} />
        <footer>
          <span>{t("PRITOK — независимый прототип для трека Superteam Kazakhstan × KASE. Не аффилирован с KASE.")}</span>
          <span>
            {t("Программа")}{" "}
            <a className="addr" href={explorerAddr(bond.program, bond.cluster)} target="_blank" rel="noopener">
              {short(bond.program)} ↗
            </a>
          </span>
        </footer>
      </main>
      <Toast bond={bond} a={a} />
    </>
  );
}

/** The most interesting event to open first: a problem, else the next one due, else the last. */
function pickDefaultEvent(bond: BondView) {
  const problem = bond.events.find((e) => ["default", "overdue"].includes(uiStatus(bond, e)));
  if (problem) return problem.pos;
  const next = bond.events.find((e) => e.payTs > bond.now);
  return next ? next.pos : bond.events.length - 1;
}

// ------------------------------------------------------------------ top bar

function nextMilestone(bond: BondView, now: number, t: T) {
  const items = bond.events.flatMap((e) => [
    { ts: e.recordTs, text: t("до фиксации «{event}»", { event: eventTitle(bond, e, t) }) },
    { ts: e.payTs, text: t("до выплаты «{event}»", { event: eventTitle(bond, e, t) }) },
  ]);
  items.push({ ts: bond.subscriptionEndTs, text: t("до конца подписки") });
  return items.filter((i) => i.ts > now).sort((a, b) => a.ts - b.ts)[0];
}

function mmss(sec: number) {
  const m = Math.floor(sec / 60);
  return `${String(m).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
}

const ROLES: [Role, string][] = [
  ["public", "Публика"],
  ["operator", "Оператор"],
  ["issuer", "Эмитент"],
  ["investor", "Инвестор"],
];

function TopBar({
  bond,
  now,
  stale,
  role,
  setRole,
}: {
  bond: BondView | null;
  now: number;
  stale: boolean;
  role: Role;
  setRole: (r: Role) => void;
}) {
  const t = useT();
  const demo = !!bond?.demo?.enabled;
  const next = bond ? nextMilestone(bond, now, t) : undefined;
  return (
    <header className="top">
      <div className="wrap">
        <a className="brand" href="/" style={{ textDecoration: "none" }}>
          <span className="brand-mark" />
          PRITOK<small>{t("реестр и выплаты")}</small>
        </a>
        <a className="seg-link" href="/bonds" data-tour="bonds">
          {t("Все выпуски")}
        </a>
        <a className="seg-link" href="/portfolio">
          {t("Портфель")}
        </a>
        <div className="spacer" />
        <span
          className={`live${stale ? " stale" : ""}`}
          title={stale ? t("Нет связи с devnet — показаны последние данные") : t("Данные из devnet, обновление каждые 10 с")}
        >
          <i />
          devnet
        </span>
        {bond && (
          <div className="clock" title={t("Время в демо ускорено: 1 полугодие = {n} секунд", { n: bond.periodSecs })}>
            <span className="dot" />
            {next ? (
              <>
                {next.text} <b>{mmss(next.ts - now)}</b>
              </>
            ) : (
              t("все даты прошли")
            )}
          </div>
        )}
        {demo && <NewBondButton className="btn ghost small-btn" />}
        <button className="btn ghost small-btn tour-btn" onClick={() => startTour(t)} title={t("Короткий тур по экрану")}>
          <span className="tour-long">{t("Как это работает")}</span>
          <span className="tour-short">?</span>
        </button>
        <LangSwitch />
      </div>
      <div className="wrap rolebar">
        <div className="role" data-tour="roles">
          <span className="seg-label">{t("Смотреть как")}</span>
          <div className="seg" role="group" aria-label={t("Роль")}>
            {ROLES.map(([r, name]) => (
              <button
                key={r}
                aria-pressed={role === r}
                disabled={r !== "public" && !demo}
                title={r !== "public" && !demo ? t("Действия доступны только в демо-выпуске") : undefined}
                onClick={() => setRole(r)}
              >
                {t(name)}
              </button>
            ))}
          </div>
        </div>
        {bond && <span className="rolebar-note">{t("Ускоренное время: 1 полугодие = {n} с", { n: bond.periodSecs })}</span>}
      </div>
    </header>
  );
}

// ------------------------------------------------------------------ bond header

function BondHeader({ bond }: { bond: BondView }) {
  const t = useT();
  const face = currentFace(bond);
  const debt = issuerDebt(bond);
  const holders = bond.holders.filter((h) => h.balance > 0).length;
  const defaulted = bond.events.filter((e) => ["default", "overdue"].includes(uiStatus(bond, e)));
  const years = bond.events.filter((e) => e.kind === KIND.COUPON).length / 2;
  const matured = bond.supply === 0 && bond.subscriptionClosed;
  return (
    <section className="card bond" data-tour="bond">
      <div className="bond-id">
        <div className="issuer">
          {issuerOf(bond.issuer, t)} · {t("тестовый эмитент")}
        </div>
        <h1>
          {t("Облигации {pct}%", { pct: bond.couponBps / 100 })} · {t(years === 1 ? "{n} год" : "{n} года", { n: years })}
          {bond.events.some((e) => e.kind === KIND.PARTIAL_REDEMPTION) ? ` · ${t("амортизируемые")}` : ""}
        </h1>
        <div className="tags">
          <span className="tag">{t("Купон 2 раза в год")}</span>
          <span className="tag">{t("Выплаты в tKZT")}</span>
          <span className="tag">Solana {bond.cluster}</span>
          {matured && <span className="tag">{t("Выпуск погашен")}</span>}
          {bond.paused && <span className="tag red">{t("Операции приостановлены регистратором")}</span>}
          {defaulted.map((e) => (
            <span key={e.pos} className="tag red">
              {t(uiStatus(bond, e) === "default" ? "Технический дефолт по «{event}»" : "Просрочка по «{event}»", {
                event: eventTitle(bond, e, t),
              })}
            </span>
          ))}
        </div>
        <div className="code">
          {t("Код выпуска")}{" "}
          <a href={explorerAddr(bond.bond, bond.cluster)} target="_blank" rel="noopener">
            {short(bond.bond)} ↗
          </a>
        </div>
      </div>
      <div className="kpis">
        <div className="kpi">
          <div className="l">{t("Номинал облигации")}</div>
          <div className="v">{money(face)} ₸</div>
          <div className="s">
            {face !== bond.faceValue ? (
              <>
                <s>{money(bond.faceValue)}</s> · {t("погашено {pct}%", { pct: Math.round((1 - face / bond.faceValue) * 100) })}
              </>
            ) : (
              t("без амортизации")
            )}
          </div>
        </div>
        <div className="kpi">
          <div className="l">{t("В обращении")}</div>
          <div className="v">{t("{n} шт.", { n: count(bond.supply) })}</div>
          <div className="s">
            {bond.issuedUnits > bond.supply && bond.subscriptionClosed
              ? t("погашено и сожжено {n}", { n: count(bond.issuedUnits - bond.supply) })
              : t(ruPlural(holders, "{n} держатель", "{n} держателя", "{n} держателей"), { n: holders })}
          </div>
        </div>
        <div className="kpi">
          <div className="l">{t("Выплачено держателям")}</div>
          <div className="v" style={{ color: "var(--green)" }}>{money(totalClaimed(bond))} ₸</div>
          <div className="s">{t("купоны, амортизация и номинал")}</div>
        </div>
        <div className={`kpi${debt ? " debt" : ""}`}>
          <div className="l">{t("Долг эмитента")}</div>
          <div className="v">{money(debt)} ₸</div>
          <div className="s">{debt ? t("срок выплаты прошёл") : t("просрочек нет")}</div>
        </div>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ timeline

function markerPosition(bond: BondView, now: number) {
  const n = bond.events.length;
  const point = (k: number) => ((k + 0.5) / n) * 100;
  const pays = bond.events.map((e) => e.payTs);
  if (now <= pays[0]) {
    const f = Math.max(0, (now - bond.startTs) / (pays[0] - bond.startTs));
    return f * point(0);
  }
  for (let k = 0; k < n - 1; k++) {
    if (now < pays[k + 1]) {
      const span = pays[k + 1] - pays[k];
      const f = span > 0 ? (now - pays[k]) / span : 1;
      return point(k) + f * (point(k + 1) - point(k));
    }
  }
  return 100;
}

function Timeline({
  bond,
  now,
  selected,
  onSelect,
}: {
  bond: BondView;
  now: number;
  selected: number;
  onSelect: (pos: number) => void;
}) {
  const t = useT();
  const at = markerPosition(bond, now);
  return (
    <section className="card" data-tour="timeline">
      <div className="card-h">
        <h2>{t("Жизнь выпуска")}</h2>
        <span className="hint">{t("даты фиксации реестра и выплат")}</span>
      </div>
      <div className="tl">
        <div className="tl-track">
          <div className="tl-fill" style={{ width: `${at}%` }} />
          {at < 100 && (
            <div className="tl-now" style={{ left: `${at}%` }}>
              <span>{t("сейчас")}</span>
            </div>
          )}
        </div>
        <div className="tl-points" style={{ gridTemplateColumns: `repeat(${bond.events.length}, 1fr)` }}>
          {bond.events.map((e) => {
            const st = uiStatus(bond, e);
            const debt = e.required - e.funded;
            return (
              <div key={e.pos} className={`tl-p ${st}`} aria-selected={e.pos === selected} onClick={() => onSelect(e.pos)}>
                <div className="n">{eventTitle(bond, e, t)}</div>
                <div className="d">{dateTime(e.payTs)}</div>
                <div className="a">
                  {st === "default" || st === "overdue" ? t("долг {amount} ₸", { amount: money(debt) }) : `${money(e.amountPerUnit)} ₸`}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ events table

function EventsTable({ bond, selected, onSelect }: { bond: BondView; selected: number; onSelect: (pos: number) => void }) {
  const t = useT();
  return (
    <section className="card" data-tour="events">
      <div className="card-h">
        <h2>
          {t("Корпоративные действия")}{" "}
          <Term tip={t("События, которые компания обязана провести по облигациям: выплата купонов, частичное досрочное погашение (амортизация) и погашение в конце срока.")} />
        </h2>
        <span className="hint">{t("нажмите на строку — покажем расчёт")}</span>
      </div>
      <div className="card-b scroll">
        <table>
          <thead>
            <tr>
              <th>{t("Событие")}</th>
              <th>
                {t("Фиксация")}{" "}
                <Term tip={t("Дата фиксации реестра: кто владеет облигациями в этот момент, тот и получает выплату. Перевод после этой даты выплату не передаёт. По закону РК реестр фиксируется на начало последнего дня купонного периода; в демо это окно растянуто до 30 секунд, чтобы успеть показать перевод после фиксации.")} />
              </th>
              <th>{t("Выплата")}</th>
              <th className="r">{t("На облигацию")}</th>
              <th className="r">{t("Внесено")}</th>
              <th>{t("Статус")}</th>
            </tr>
          </thead>
          <tbody>
            {bond.events.map((e) => {
              const st = uiStatus(bond, e);
              const pct = e.required ? Math.min(100, Math.round((e.funded / e.required) * 100)) : 0;
              return (
                <tr key={e.pos} aria-selected={e.pos === selected} onClick={() => onSelect(e.pos)}>
                  <td>
                    <span className="ev-name">{eventTitle(bond, e, t)}</span>
                    <span className="ev-kind">{eventSubtitle(bond, e, t)}</span>
                  </td>
                  <td>{dateTime(e.recordTs)}</td>
                  <td>{dateTime(e.payTs)}</td>
                  <td className="r">{money(e.amountPerUnit)} ₸</td>
                  <td className="r">
                    {money(e.funded)}
                    <span className="of">{t("из {total}", { total: money(e.required) })}</span>
                    <div className={`bar ${st === "default" || st === "overdue" ? "red" : ""}`}>
                      <i style={{ width: `${pct}%` }} />
                    </div>
                  </td>
                  <td>
                    <span className={`st ${st === "default" || st === "overdue" ? "default" : st === "planned" ? "planned" : "paid"}`}>
                      {t(STATUS_LABEL[st])}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ calculation

function CalcPanel({
  bond,
  event: e,
  onDefault,
  busy,
}: {
  bond: BondView;
  event: EventView;
  onDefault?: (actionId: number) => void;
  busy?: boolean;
}) {
  const t = useT();
  const st = uiStatus(bond, e);
  const recorded = e.recordTs <= bond.now;
  const rows = bond.holders
    .map((h) => {
      const units = h.unitsAt[e.pos] ?? h.balance;
      const claim = bond.claims.find((c) => c.owner === h.owner && c.actionId === e.actionId);
      return { h, units, claim };
    })
    .filter((r) => r.units > 0 || r.claim);
  const total = rows.reduce((s, r) => s + r.units * e.amountPerUnit, 0);

  const note = (() => {
    if (!recorded) return t("Реестр на эту дату ещё не зафиксирован — расчёт предварительный, по текущим балансам.");
    if (st === "default")
      return t("Эмитент внёс {funded} из {required} ₸. Выплаты закрыты, пока долг не погашен полностью — частично долг не списывается.", {
        funded: money(e.funded),
        required: money(e.required),
      });
    if (st === "overdue") return t("Срок выплаты прошёл, а денег внесено меньше нужного. Любой может зафиксировать технический дефолт.");
    if (e.kind === KIND.PARTIAL_REDEMPTION) return t("Эмитент внёс всю сумму в момент объявления. Номинал уменьшен, следующие купоны пересчитаны.");
    if (e.kind === KIND.MATURITY) return t("С даты фиксации переводы закрыты. Держатель сдаёт облигации — они сжигаются — и получает номинал.");
    return t("Купон начислен на номинал, который был в обращении весь купонный период.");
  })();

  return (
    <>
      <h3>{eventTitle(bond, e, t)}</h3>
      <div className="sub">{t("фиксация {record} · выплата {pay}", { record: dateTime(e.recordTs), pay: dateTime(e.payTs) })}</div>
      <LifecycleSteps bond={bond} e={e} />
      <div className="formula">
        {t("Сумма")} = <b>{t("облигаций на дату фиксации")}</b> × <b>{money(e.amountPerUnit)} ₸</b> {t("на облигацию")}
      </div>
      {rows.length === 0 && <div className="empty">{t("Держателей нет")}</div>}
      {rows.map(({ h, units, claim }) => (
        <div className="line" key={h.owner}>
          <div className="who">{nameOf(h.owner, t)}</div>
          <div className="sum">{money(units * e.amountPerUnit)} ₸</div>
          <div className="eq">
            {t("{n} обл.", { n: count(units) })} × {money(e.amountPerUnit)} ₸
          </div>
          <div className="tx">
            {claim ? (
              <a
                href={explorerAddr(claim.address, bond.cluster)}
                target="_blank"
                rel="noopener"
                title={
                  claim.status === CLAIM.BANK_CONFIRMED
                    ? t("Хеш платёжного поручения: {hash}", { hash: claim.bankRefHash ?? "" })
                    : t("Квитанция о выплате в блокчейне")
                }
                className={claim.status === CLAIM.BANK_REQUESTED ? "amber" : undefined}
              >
                {claim.status === CLAIM.PAID
                  ? e.kind === KIND.MATURITY
                    ? t("сожжено, номинал выплачен")
                    : t("на кошелёк")
                  : claim.status === CLAIM.BANK_REQUESTED
                    ? t("поручение в банк")
                    : t("оплачено банком")}{" "}
                ↗
              </a>
            ) : st === "default" || st === "overdue" ? (
              <span className="pending">{t("ждёт погашения долга")}</span>
            ) : st === "paying" ? (
              <span style={{ color: "var(--green)" }}>{t("можно получить")}</span>
            ) : (
              <span style={{ color: "var(--muted)" }}>{t("к выплате {date}", { date: dateTime(e.payTs) })}</span>
            )}
          </div>
        </div>
      ))}
      <div className="total">
        <span>{t("Итого держателям")}</span>
        <span>{money(total)} ₸</span>
      </div>
      <div className={`note${st === "default" || st === "overdue" ? " red" : ""}`}>{note}</div>
      {st === "overdue" && onDefault && (
        <button className="btn danger" style={{ marginTop: 12 }} disabled={busy} onClick={() => onDefault(e.actionId)}>
          {t("Зафиксировать дефолт")}
        </button>
      )}
    </>
  );
}

/** One corporate action end to end: created, register fixed, funded, executed — each with its proof. */
function LifecycleSteps({ bond, e }: { bond: BondView; e: EventView }) {
  const t = useT();
  const ops = bond.ops;
  const last = (pred: (o: OpView) => boolean) => [...ops].reverse().find(pred);
  // A partial redemption is declared against the coupon that shares its record date.
  const anchor = bond.events.find((x) => x.kind === KIND.COUPON && x.recordTs === e.recordTs);
  const created =
    e.kind === KIND.PARTIAL_REDEMPTION
      ? last((o) => o.name === "declare_partial_redemption" && o.actionId === anchor?.actionId)
      : ops.find((o) => o.name === "create_bond");
  const funded = e.kind === KIND.PARTIAL_REDEMPTION ? created : last((o) => o.name === "fund_action" && o.actionId === e.actionId);
  const paidOp = last((o) => ["claim", "pay_holder", "claim_to_bank", "redeem", "redeem_for"].includes(o.name) && (o.actionId === e.actionId || o.name.startsWith("redeem")));
  const rows = executionRows(bond, e);
  const paid = rows.filter((r) => r.claim).length;
  const isFunded = e.funded >= e.required && e.required > 0;
  const overdue = bond.now >= e.payTs && !isFunded;
  const steps: { done: boolean; alert?: boolean; title: string; note: string; sig?: string }[] = [
    { done: true, title: t("Создано"), note: e.kind === KIND.PARTIAL_REDEMPTION ? t("объявлено эмитентом") : t("в графике выпуска"), sig: created?.sig },
    {
      done: bond.now >= e.recordTs,
      title: t("Реестр зафиксирован"),
      note: bond.now >= e.recordTs ? t("балансы на дату записаны программой") : dateTime(e.recordTs),
    },
    {
      done: isFunded,
      alert: overdue,
      title: t("Деньги внесены"),
      note: `${money(e.funded)} / ${money(e.required)} ₸`,
      sig: funded?.sig,
    },
    {
      done: rows.length > 0 && paid >= rows.length && bond.now >= e.payTs,
      title: t("Исполнено"),
      note: t("{paid} из {total} держателей", { paid, total: rows.length }),
      sig: paid ? paidOp?.sig : undefined,
    },
  ];
  return (
    <ol className="steps">
      {steps.map((st, i) => (
        <li key={i} className={st.alert ? "alert" : st.done ? "done" : ""}>
          <b>{st.title}</b>
          <span>
            {st.note}
            {st.sig && (
              <>
                {" "}
                <a href={explorerTx(st.sig, bond.cluster)} target="_blank" rel="noopener">
                  ↗
                </a>
              </>
            )}
          </span>
        </li>
      ))}
    </ol>
  );
}

// ------------------------------------------------------------------ registry at date

function Registry({ bond }: { bond: BondView }) {
  const t = useT();
  const options = useMemo(() => {
    const seen = new Map<number, EventView[]>();
    for (const e of bond.events) {
      if (e.recordTs > bond.now) continue;
      seen.set(e.recordTs, [...(seen.get(e.recordTs) ?? []), e]);
    }
    const list = [...seen.entries()].map(([ts, evs]) => ({
      key: String(ts),
      label: evs.map((e) => eventTitle(bond, e, t)).join(" + "),
      pos: evs[0].pos as number | null,
    }));
    list.push({ key: "now", label: t("Сейчас"), pos: null });
    return list;
  }, [bond, t]);
  const [key, setKey] = useState<string | null>(null);
  const idx = Math.max(0, options.findIndex((o) => o.key === key));
  const current = options[key ? idx : 0];
  const prev = options[options.indexOf(current) - 1];
  const units = (h: BondView["holders"][number], o: (typeof options)[number]) =>
    o.pos === null ? h.balance : (h.unitsAt[o.pos] ?? h.balance);
  const rows = bond.holders.filter((h) => units(h, current) > 0 || (prev && units(h, prev) > 0));
  const total = rows.reduce((s, h) => s + units(h, current), 0) || 1;

  return (
    <section className="card" data-tour="registry">
      <div className="reg-head">
        <h2>{t("Реестр держателей на дату")}</h2>
        <div className="seg" role="group" aria-label={t("Дата реестра")}>
          {options.map((o) => (
            <button key={o.key} aria-pressed={o === current} onClick={() => setKey(o.key)}>
              {o.label}
            </button>
          ))}
        </div>
      </div>
      <div className="card-b scroll">
        {rows.length === 0 ? (
          <div className="empty">{t("Все облигации погашены — держателей нет")}</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>{t("Держатель")}</th>
                <th className="r">{t("Облигаций")}</th>
                <th>{t("Доля")}</th>
                <th className="r">{t("Изменение")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((h) => {
                const u = units(h, current);
                const d = prev ? u - units(h, prev) : 0;
                const share = (u / total) * 100;
                const name = nameOf(h.owner, t);
                return (
                  <tr key={h.owner}>
                    <td>
                      <div className="who-cell">
                        <span className="avatar" style={{ background: colorFor(h.owner) }}>{name[0]}</span>
                        <div>
                          <div style={{ fontWeight: 600 }}>{name}</div>
                          <div className="addr">{short(h.owner)}</div>
                        </div>
                      </div>
                    </td>
                    <td className="r" style={{ fontWeight: 700 }}>{count(u)}</td>
                    <td>
                      <div className="share">
                        <div className="bar">
                          <i style={{ width: `${share}%` }} />
                        </div>
                        <span>{share.toFixed(1)}%</span>
                      </div>
                    </td>
                    <td className="r">
                      {d ? <span className={`delta ${d > 0 ? "up" : "down"}`}>{d > 0 ? `+${d}` : d}</span> : <span style={{ color: "var(--muted)" }}>—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ journal

function transferContext(bond: BondView, time: number, t: T) {
  const window = bond.events.find((e) => e.recordTs <= time && time < e.payTs);
  if (window)
    return { chip: "after", text: t("после фиксации «{event}» — выплата остаётся у отправителя", { event: eventTitle(bond, window, t) }) };
  const next = bond.events.find((e) => time < e.recordTs);
  if (next) return { chip: "before", text: t("до фиксации «{event}» — выплата перейдёт к получателю", { event: eventTitle(bond, next, t) }) };
  return null;
}

function describe(bond: BondView, op: OpView, t: T) {
  const ev = op.actionId !== undefined ? bond.events.find((e) => e.actionId === op.actionId) : undefined;
  const event = ev ? `«${eventTitle(bond, ev, t)}»` : "";
  const who = op.actor ? nameOf(op.actor, t) : "";
  const to = nameOf(op.counterparty ?? "", t);
  const units = count(op.units ?? 0);
  switch (op.name) {
    case "create_bond":
      return t("Эмитент создал выпуск и график выплат");
    case "allow_holder":
      return t("Регистратор допустил {who}", { who });
    case "subscribe":
      return t("{who} — подписка, {n} обл.", { who, n: units });
    case "close_subscription":
      return t("Подписка закрыта, число облигаций зафиксировано");
    case "transfer_bond":
      return t("{who} → {to}, {n} обл.", { who, to, n: units });
    case "fund_action":
      return t("Эмитент внёс {amount} ₸ по {event}", { amount: money(op.amount ?? 0), event });
    case "declare_partial_redemption":
      return t("Эмитент объявил амортизацию на дату {event} и внёс деньги", { event });
    case "mark_default":
      return t("Зафиксирован технический дефолт по {event}", { event });
    case "claim":
      return t("{who} получил выплату по {event}", { who, event });
    case "redeem":
      return t("{who} сдал облигации и получил номинал", { who });
    case "redeem_for":
      return t("Оператор погасил облигации {to}: номинал выплачен, облигации сожжены", { to });
    case "pay_holder":
      return t("Оператор исполнил выплату по {event}: {n} держателям на кошельки", { event, n: op.units ?? 1 });
    case "claim_to_bank":
      return t("Выплата по {event} для {to} направлена платёжному агенту для перевода в банк", { event, to });
    case "confirm_bank_payment":
      return t("Платёжный агент подтвердил банковский перевод {to} по {event}", { to, event });
    case "trade_dvp": {
      const price = op.cleanPriceBps !== undefined ? t(" по {pct}%", { pct: op.cleanPriceBps / 100 }) : "";
      const accrued = op.accruedPerUnit
        ? t(" + НКД {amount} ₸ за облигацию", { amount: money(op.accruedPerUnit) })
        : op.accruedPerUnit === 0
          ? t(" без купона")
          : "";
      const total = op.amount !== undefined ? ` = ${money(op.amount)} ₸` : "";
      return t("Сделка: {who} продал {to} {n} обл.{price}{accrued}{total} — поставка против оплаты", {
        who,
        to,
        n: units,
        price,
        accrued,
        total,
      });
    }
    case "revoke_holder": {
      const h = bond.holders.find((x) => x.address === op.counterparty);
      return t("Регистратор отозвал допуск {who}", { who: h ? nameOf(h.owner, t) : "" });
    }
    default:
      return op.name;
  }
}

function Journal({ bond }: { bond: BondView }) {
  const t = useT();
  const [all, setAll] = useState(false);
  const ops = [...bond.ops].reverse();
  const shown = all ? ops : ops.slice(0, 12);
  return (
    <section className="card" data-tour="journal">
      <div className="card-h">
        <h2>{t("Журнал операций")}</h2>
        <span className="hint">{t("каждая строка — транзакция в блокчейне")}</span>
      </div>
      <div className="card-b">
        <div className="ops">
          {shown.map((op) => {
            const ctx = op.name === "transfer_bond" ? transferContext(bond, op.time, t) : null;
            return (
              <div className="op" key={op.sig}>
                <span className="when">{dateTime(op.time)}</span>
                <span>
                  {describe(bond, op, t)}
                  {ctx && (
                    <>
                      {" "}
                      <span className={`chip ${ctx.chip}`}>{ctx.chip === "after" ? t("после фиксации") : t("до фиксации")}</span>{" "}
                      <span style={{ color: "var(--muted)", fontSize: 12 }}>{ctx.text}</span>
                    </>
                  )}
                </span>
                <a href={explorerTx(op.sig, bond.cluster)} target="_blank" rel="noopener">
                  {t("транзакция")} ↗
                </a>
              </div>
            );
          })}
        </div>
        {ops.length > 12 && (
          <div style={{ marginTop: 12 }}>
            <button className="linkbtn" onClick={() => setAll(!all)}>
              {all ? t("Свернуть") : t("Показать все {n}", { n: ops.length })}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ what now

function NextStepBar({
  bond,
  now,
  demo,
  onGo,
}: {
  bond: BondView;
  now: number;
  demo: boolean;
  onGo: (role: Role, who?: "aigerim" | "bolat" | "fund") => void;
}) {
  const t = useT();
  const step = nextStep(bond, now, t);
  return (
    <div className={`next-step ${step.tone}`} data-tour="next-step" role="status">
      <span className="next-label">{t("Сейчас")}</span>
      <span className="next-text">
        {step.text}
        {step.until && step.until > now && <b className="next-timer"> {mmss(step.until - now)}</b>}
      </span>
      {demo && step.go && (
        <button className="btn small-btn" onClick={() => onGo(step.go!.role, step.go!.who)}>
          {step.go.label} →
        </button>
      )}
    </div>
  );
}
