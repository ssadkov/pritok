"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { InvestorPanel, IssuerPanel, OperatorPanel, Toast, useAct, type Role } from "./RolePanels";
import { DEFAULT_BOND, ISSUER_NAME, colorFor, label } from "@/lib/demo";
import {
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
  const { bond, error, fetchedAt, reload } = useBond(address);
  const now = useNow(bond, fetchedAt);
  const [selected, setSelected] = useState<number | null>(null);
  const [role, setRoleState] = useState<Role>("public");
  const [who, setWhoState] = useState<"aigerim" | "bolat" | "fund">("aigerim");
  const a = useAct(address, reload);

  // Role and investor live in the URL (?as=investor&who=bolat) so a view can be shared.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const r = q.get("as");
    if (r === "issuer" || r === "operator" || r === "investor") setRoleState(r);
    const w = q.get("who");
    if (w === "aigerim" || w === "bolat" || w === "fund") setWhoState(w);
  }, []);
  const syncUrl = (r: Role, w: string) => {
    const q = new URLSearchParams();
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
          <div className="card card-b empty">{error ? `Не удалось загрузить выпуск: ${error}` : "Загружаем выпуск из devnet…"}</div>
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
        <BondHeader bond={bond} />
        {demo && role === "issuer" && <IssuerPanel bond={bond} a={a} />}
        {demo && role === "investor" && <InvestorPanel bond={bond} a={a} who={who} setWho={setWho} />}
        {demo && role === "operator" && <OperatorPanel bond={bond} a={a} />}
        <Timeline bond={bond} now={now} selected={pos} onSelect={setSelected} />
        <div className="grid2">
          <EventsTable bond={bond} selected={pos} onSelect={setSelected} />
          <aside className="card calc" aria-live="polite">
            <div className="card-b">
              <CalcPanel
                bond={bond}
                event={bond.events[pos]}
                busy={!!a.busy}
                onDefault={
                  demo
                    ? (actionId) => a.act("default-" + actionId, "Технический дефолт зафиксирован", { type: "markDefault", actionId })
                    : undefined
                }
              />
            </div>
          </aside>
        </div>
        <Registry bond={bond} />
        <Journal bond={bond} />
        <footer>
          <span>PRITOK — независимый прототип для трека Superteam Kazakhstan × KASE. Не аффилирован с KASE.</span>
          <span>
            Программа{" "}
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

function nextMilestone(bond: BondView, now: number) {
  const items = bond.events.flatMap((e) => [
    { ts: e.recordTs, text: `до фиксации «${eventTitle(bond, e)}»` },
    { ts: e.payTs, text: `до выплаты «${eventTitle(bond, e)}»` },
  ]);
  items.push({ ts: bond.subscriptionEndTs, text: "до конца подписки" });
  return items.filter((i) => i.ts > now).sort((a, b) => a.ts - b.ts)[0];
}

function mmss(sec: number) {
  const m = Math.floor(sec / 60);
  return `${String(m).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
}

const ROLES: [Role, string][] = [
  ["public", "Публика"],
  ["issuer", "Эмитент"],
  ["operator", "Регистратор"],
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
  const demo = !!bond?.demo?.enabled;
  const next = bond ? nextMilestone(bond, now) : undefined;
  return (
    <header className="top">
      <div className="wrap">
        <a className="brand" href={`/bond/${DEFAULT_BOND}`} style={{ textDecoration: "none" }}>
          <span className="brand-mark" />
          PRITOK<small>реестр и выплаты</small>
        </a>
        <div className="role">
          <span className="seg-label">Смотреть как</span>
          <div className="seg" role="group" aria-label="Роль">
            {ROLES.map(([r, name]) => (
              <button
                key={r}
                aria-pressed={role === r}
                disabled={r !== "public" && !demo}
                title={r !== "public" && !demo ? "Действия доступны только в демо-выпуске" : undefined}
                onClick={() => setRole(r)}
              >
                {name}
              </button>
            ))}
          </div>
        </div>
        <div className="spacer" />
        <span className={`live${stale ? " stale" : ""}`} title={stale ? "Нет связи с devnet — показаны последние данные" : "Данные из devnet, обновление каждые 10 с"}>
          <i />
          devnet
        </span>
        {bond && (
          <div className="clock" title={`Время в демо ускорено: 1 полугодие = ${bond.periodSecs} секунд`}>
            <span className="dot" />
            <span className="clock-long">Ускоренное время · 1 полугодие = {bond.periodSecs} с ·</span>
            {next ? (
              <>
                {next.text} <b>{mmss(next.ts - now)}</b>
              </>
            ) : (
              "все даты прошли"
            )}
          </div>
        )}
        <div className="lang">
          KZ · EN · <b>RU</b>
        </div>
      </div>
    </header>
  );
}

// ------------------------------------------------------------------ bond header

function BondHeader({ bond }: { bond: BondView }) {
  const face = currentFace(bond);
  const debt = issuerDebt(bond);
  const holders = bond.holders.filter((h) => h.balance > 0).length;
  const defaulted = bond.events.filter((e) => ["default", "overdue"].includes(uiStatus(bond, e)));
  const years = (bond.events.filter((e) => e.kind === KIND.COUPON).length / 2).toString();
  const matured = bond.supply === 0 && bond.subscriptionClosed;
  return (
    <section className="card bond">
      <div className="bond-id">
        <div className="issuer">{ISSUER_NAME[bond.issuer] ?? label(bond.issuer)} · тестовый эмитент</div>
        <h1>
          Облигации {bond.couponBps / 100}% · {years} {years === "1" ? "год" : "года"}
          {bond.events.some((e) => e.kind === KIND.PARTIAL_REDEMPTION) ? " · амортизируемые" : ""}
        </h1>
        <div className="tags">
          <span className="tag">Купон 2 раза в год</span>
          <span className="tag">Выплаты в tKZT</span>
          <span className="tag">Solana {bond.cluster}</span>
          {matured && <span className="tag">Выпуск погашен</span>}
          {defaulted.map((e) => (
            <span key={e.pos} className="tag red">
              {uiStatus(bond, e) === "default" ? "Технический дефолт" : "Просрочка"} по «{eventTitle(bond, e)}»
            </span>
          ))}
        </div>
        <div className="code">
          Код выпуска{" "}
          <a href={explorerAddr(bond.bond, bond.cluster)} target="_blank" rel="noopener">
            {short(bond.bond)} ↗
          </a>
        </div>
      </div>
      <div className="kpis">
        <div className="kpi">
          <div className="l">Номинал облигации</div>
          <div className="v">{money(face)} ₸</div>
          <div className="s">
            {face !== bond.faceValue ? (
              <>
                <s>{money(bond.faceValue)}</s> · погашено {Math.round((1 - face / bond.faceValue) * 100)}%
              </>
            ) : (
              "без амортизации"
            )}
          </div>
        </div>
        <div className="kpi">
          <div className="l">В обращении</div>
          <div className="v">{count(bond.supply)} шт.</div>
          <div className="s">
            {matured ? `выпущено ${count(bond.issuedUnits)}` : `${holders} держател${holders === 1 ? "ь" : holders < 5 ? "я" : "ей"}`}
          </div>
        </div>
        <div className="kpi">
          <div className="l">Выплачено держателям</div>
          <div className="v" style={{ color: "var(--green)" }}>{money(totalClaimed(bond))} ₸</div>
          <div className="s">купоны, амортизация и номинал</div>
        </div>
        <div className={`kpi${debt ? " debt" : ""}`}>
          <div className="l">Долг эмитента</div>
          <div className="v">{money(debt)} ₸</div>
          <div className="s">{debt ? "срок выплаты прошёл" : "просрочек нет"}</div>
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
  const at = markerPosition(bond, now);
  return (
    <section className="card">
      <div className="card-h">
        <h2>Жизнь выпуска</h2>
        <span className="hint">даты фиксации реестра и выплат</span>
      </div>
      <div className="tl">
        <div className="tl-track">
          <div className="tl-fill" style={{ width: `${at}%` }} />
          {at < 100 && (
            <div className="tl-now" style={{ left: `${at}%` }}>
              <span>сейчас</span>
            </div>
          )}
        </div>
        <div className="tl-points" style={{ gridTemplateColumns: `repeat(${bond.events.length}, 1fr)` }}>
          {bond.events.map((e) => {
            const st = uiStatus(bond, e);
            const debt = e.required - e.funded;
            return (
              <div key={e.pos} className={`tl-p ${st}`} aria-selected={e.pos === selected} onClick={() => onSelect(e.pos)}>
                <div className="n">{eventTitle(bond, e)}</div>
                <div className="d">{dateTime(e.payTs)}</div>
                <div className="a">
                  {st === "default" || st === "overdue" ? `долг ${money(debt)} ₸` : `${money(e.amountPerUnit)} ₸`}
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
  return (
    <section className="card">
      <div className="card-h">
        <h2>Корпоративные действия</h2>
        <span className="hint">нажмите на строку — покажем расчёт</span>
      </div>
      <div className="card-b scroll">
        <table>
          <thead>
            <tr>
              <th>Событие</th>
              <th>Фиксация</th>
              <th>Выплата</th>
              <th className="r">На облигацию</th>
              <th className="r">Внесено</th>
              <th>Статус</th>
            </tr>
          </thead>
          <tbody>
            {bond.events.map((e) => {
              const st = uiStatus(bond, e);
              const pct = e.required ? Math.min(100, Math.round((e.funded / e.required) * 100)) : 0;
              return (
                <tr key={e.pos} aria-selected={e.pos === selected} onClick={() => onSelect(e.pos)}>
                  <td>
                    <span className="ev-name">{eventTitle(bond, e)}</span>
                    <span className="ev-kind">{eventSubtitle(bond, e)}</span>
                  </td>
                  <td>{dateTime(e.recordTs)}</td>
                  <td>{dateTime(e.payTs)}</td>
                  <td className="r">{money(e.amountPerUnit)} ₸</td>
                  <td className="r">
                    {money(e.funded)}
                    <span className="of">из {money(e.required)}</span>
                    <div className={`bar ${st === "default" || st === "overdue" ? "red" : ""}`}>
                      <i style={{ width: `${pct}%` }} />
                    </div>
                  </td>
                  <td>
                    <span className={`st ${st === "default" || st === "overdue" ? "default" : st === "planned" ? "planned" : "paid"}`}>
                      {STATUS_LABEL[st]}
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
    if (!recorded) return "Реестр на эту дату ещё не зафиксирован — расчёт предварительный, по текущим балансам.";
    if (st === "default") return `Эмитент внёс ${money(e.funded)} из ${money(e.required)} ₸. Выплаты закрыты, пока долг не погашен полностью — частично долг не списывается.`;
    if (st === "overdue") return "Срок выплаты прошёл, а денег внесено меньше нужного. Любой может зафиксировать технический дефолт.";
    if (e.kind === KIND.PARTIAL_REDEMPTION) return "Эмитент внёс всю сумму в момент объявления. Номинал уменьшен, следующие купоны пересчитаны.";
    if (e.kind === KIND.MATURITY) return "С даты фиксации переводы закрыты. Держатель сдаёт облигации — они сжигаются — и получает номинал.";
    return "Купон начислен на номинал, который был в обращении весь купонный период.";
  })();

  return (
    <>
      <h3>{eventTitle(bond, e)}</h3>
      <div className="sub">
        фиксация {dateTime(e.recordTs)} · выплата {dateTime(e.payTs)}
      </div>
      <div className="formula">
        Сумма = <b>облигаций на дату фиксации</b> × <b>{money(e.amountPerUnit)} ₸</b> на облигацию
      </div>
      {rows.length === 0 && <div className="empty">Держателей нет</div>}
      {rows.map(({ h, units, claim }) => (
        <div className="line" key={h.owner}>
          <div className="who">{label(h.owner)}</div>
          <div className="sum">{money(units * e.amountPerUnit)} ₸</div>
          <div className="eq">
            {count(units)} обл. × {money(e.amountPerUnit)} ₸
          </div>
          <div className="tx">
            {claim ? (
              <a href={explorerAddr(claim.address, bond.cluster)} target="_blank" rel="noopener" title="Квитанция о выплате в блокчейне">
                выплачено ↗
              </a>
            ) : st === "default" || st === "overdue" ? (
              <span className="pending">ждёт погашения долга</span>
            ) : st === "paying" ? (
              <span style={{ color: "var(--green)" }}>можно получить</span>
            ) : (
              <span style={{ color: "var(--muted)" }}>к выплате {dateTime(e.payTs)}</span>
            )}
          </div>
        </div>
      ))}
      <div className="total">
        <span>Итого держателям</span>
        <span>{money(total)} ₸</span>
      </div>
      <div className={`note${st === "default" || st === "overdue" ? " red" : ""}`}>{note}</div>
      {st === "overdue" && onDefault && (
        <button className="btn danger" style={{ marginTop: 12 }} disabled={busy} onClick={() => onDefault(e.actionId)}>
          Зафиксировать дефолт
        </button>
      )}
    </>
  );
}

// ------------------------------------------------------------------ registry at date

function Registry({ bond }: { bond: BondView }) {
  const options = useMemo(() => {
    const seen = new Map<number, EventView[]>();
    for (const e of bond.events) {
      if (e.recordTs > bond.now) continue;
      seen.set(e.recordTs, [...(seen.get(e.recordTs) ?? []), e]);
    }
    const list = [...seen.entries()].map(([ts, evs]) => ({
      key: String(ts),
      label: evs.map((e) => eventTitle(bond, e)).join(" + "),
      pos: evs[0].pos as number | null,
    }));
    list.push({ key: "now", label: "Сейчас", pos: null });
    return list;
  }, [bond]);
  const [key, setKey] = useState<string | null>(null);
  const idx = Math.max(0, options.findIndex((o) => o.key === key));
  const current = options[key ? idx : 0];
  const prev = options[options.indexOf(current) - 1];
  const units = (h: BondView["holders"][number], o: (typeof options)[number]) =>
    o.pos === null ? h.balance : (h.unitsAt[o.pos] ?? h.balance);
  const rows = bond.holders.filter((h) => units(h, current) > 0 || (prev && units(h, prev) > 0));
  const total = rows.reduce((s, h) => s + units(h, current), 0) || 1;

  return (
    <section className="card">
      <div className="reg-head">
        <h2>Реестр держателей на дату</h2>
        <div className="seg" role="group" aria-label="Дата реестра">
          {options.map((o) => (
            <button key={o.key} aria-pressed={o === current} onClick={() => setKey(o.key)}>
              {o.label}
            </button>
          ))}
        </div>
      </div>
      <div className="card-b scroll">
        {rows.length === 0 ? (
          <div className="empty">Все облигации погашены — держателей нет</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Держатель</th>
                <th className="r">Облигаций</th>
                <th>Доля</th>
                <th className="r">Изменение</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((h) => {
                const u = units(h, current);
                const d = prev ? u - units(h, prev) : 0;
                const share = (u / total) * 100;
                return (
                  <tr key={h.owner}>
                    <td>
                      <div className="who-cell">
                        <span className="avatar" style={{ background: colorFor(h.owner) }}>{label(h.owner)[0]}</span>
                        <div>
                          <div style={{ fontWeight: 600 }}>{label(h.owner)}</div>
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

function transferContext(bond: BondView, time: number) {
  const window = bond.events.find((e) => e.recordTs <= time && time < e.payTs);
  if (window) return { chip: "after", text: `после фиксации «${eventTitle(bond, window)}» — выплата остаётся у отправителя` };
  const next = bond.events.find((e) => time < e.recordTs);
  if (next) return { chip: "before", text: `до фиксации «${eventTitle(bond, next)}» — выплата перейдёт к получателю` };
  return null;
}

function describe(bond: BondView, op: OpView) {
  const ev = op.actionId !== undefined ? bond.events.find((e) => e.actionId === op.actionId) : undefined;
  const evName = ev ? `«${eventTitle(bond, ev)}»` : "";
  const who = op.actor ? label(op.actor) : "";
  switch (op.name) {
    case "create_bond":
      return "Эмитент создал выпуск и график выплат";
    case "allow_holder":
      return `Регистратор допустил ${who}`;
    case "subscribe":
      return `${who} — подписка, ${count(op.units ?? 0)} обл.`;
    case "close_subscription":
      return "Подписка закрыта, число облигаций зафиксировано";
    case "transfer_bond":
      return `${who} → ${label(op.counterparty ?? "")}, ${count(op.units ?? 0)} обл.`;
    case "fund_action":
      return `Эмитент внёс ${money(op.amount ?? 0)} ₸ по ${evName}`;
    case "declare_partial_redemption":
      return `Эмитент объявил амортизацию на дату ${evName} и внёс деньги`;
    case "mark_default":
      return `Зафиксирован технический дефолт по ${evName}`;
    case "claim":
      return `${who} получил выплату по ${evName}`;
    case "redeem":
      return `${who} сдал облигации и получил номинал`;
    default:
      return op.name;
  }
}

function Journal({ bond }: { bond: BondView }) {
  const [all, setAll] = useState(false);
  const ops = [...bond.ops].reverse();
  const shown = all ? ops : ops.slice(0, 12);
  return (
    <section className="card">
      <div className="card-h">
        <h2>Журнал операций</h2>
        <span className="hint">каждая строка — транзакция в блокчейне</span>
      </div>
      <div className="card-b">
        <div className="ops">
          {shown.map((op) => {
            const ctx = op.name === "transfer_bond" ? transferContext(bond, op.time) : null;
            return (
              <div className="op" key={op.sig}>
                <span className="when">{dateTime(op.time)}</span>
                <span>
                  {describe(bond, op)}
                  {ctx && (
                    <>
                      {" "}
                      <span className={`chip ${ctx.chip}`}>{ctx.chip === "after" ? "после фиксации" : "до фиксации"}</span>{" "}
                      <span style={{ color: "var(--muted)", fontSize: 12 }}>{ctx.text}</span>
                    </>
                  )}
                </span>
                <a href={explorerTx(op.sig, bond.cluster)} target="_blank" rel="noopener">
                  транзакция ↗
                </a>
              </div>
            );
          })}
        </div>
        {ops.length > 12 && (
          <div style={{ marginTop: 12 }}>
            <button className="linkbtn" onClick={() => setAll(!all)}>
              {all ? "Свернуть" : `Показать все ${ops.length}`}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
