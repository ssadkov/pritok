"use client";

import { useState } from "react";
import { label } from "@/lib/demo";
import {
  KIND,
  STATUS,
  count,
  dateTime,
  eventTitle,
  explorerTx,
  money,
  short,
  uiStatus,
  type BondView,
} from "@/lib/view";

export type Role = "public" | "issuer" | "operator" | "investor";
type Investor = "aigerim" | "bolat" | "fund";

export interface ActResult {
  ok: boolean;
  text: string;
  sig?: string;
}

/** Sends one action to the demo signer and reports the outcome. */
export function useAct(address: string, onDone: () => void) {
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<ActResult | null>(null);
  const act = async (id: string, text: string, body: object) => {
    setBusy(id);
    setResult(null);
    try {
      const res = await fetch(`/api/bond/${address}/act`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      setResult(res.ok ? { ok: true, text, sig: data.sig } : { ok: false, text: data.error ?? "Ошибка" });
    } catch (e) {
      setResult({ ok: false, text: String((e as Error).message ?? e) });
    } finally {
      setBusy(null);
      onDone();
    }
  };
  return { busy, result, act, clear: () => setResult(null) };
}

type Act = ReturnType<typeof useAct>;

export function Toast({ bond, a }: { bond: BondView; a: Act }) {
  if (!a.result) return null;
  const r = a.result;
  return (
    <div className={`toast ${r.ok ? "ok" : "err"}`} role="status">
      <div>
        <b>{r.ok ? "Готово" : "Отклонено"}</b> · {r.text}
      </div>
      {r.sig && (
        <a href={explorerTx(r.sig, bond.cluster)} target="_blank" rel="noopener">
          транзакция ↗
        </a>
      )}
      <button onClick={a.clear} aria-label="Закрыть">
        ×
      </button>
    </div>
  );
}

function Btn({ a, id, children, ...rest }: { a: Act; id: string; children: React.ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className="btn" disabled={!!a.busy || rest.disabled} {...rest}>
      {a.busy === id ? "Отправляем…" : children}
    </button>
  );
}

// ------------------------------------------------------------------ issuer

export function IssuerPanel({ bond, a }: { bond: BondView; a: Act }) {
  const open = bond.events.filter((e) => e.funded < e.required);
  const future = bond.events.filter((e) => e.kind === KIND.COUPON && e.recordTs > bond.now);
  const [coupon, setCoupon] = useState<number | "">("");
  const [pct, setPct] = useState(20);
  const target = coupon === "" ? future[0]?.actionId : coupon;

  return (
    <section className="card role-panel">
      <div className="card-h">
        <h2>Кабинет эмитента</h2>
        <span className="hint">
          {label(bond.issuer)} · на счёте {money(bond.demo?.issuerTkzt ?? 0)} tKZT
        </span>
      </div>
      <div className="card-b panel-grid">
        <div>
          <h4>К оплате</h4>
          {!bond.subscriptionClosed && bond.now < bond.subscriptionEndTs && <p className="muted">Идёт подписка — суммы к оплате появятся после её закрытия.</p>}
          {open.length === 0 && <p className="muted">Все обязательства профинансированы.</p>}
          {bond.subscriptionClosed || bond.now >= bond.subscriptionEndTs
            ? open.map((e) => {
                const left = e.required - e.funded;
                const st = uiStatus(bond, e);
                return (
                  <div className="act-row" key={e.pos}>
                    <div>
                      <div className="ev-name">{eventTitle(bond, e)}</div>
                      <div className="muted small">
                        осталось {money(left)} ₸ · выплата {dateTime(e.payTs)}
                        {st === "overdue" && <span className="red"> · просрочено</span>}
                        {st === "default" && <span className="red"> · дефолт</span>}
                      </div>
                    </div>
                    <div className="btns">
                      <Btn a={a} id={`fund-${e.actionId}`} onClick={() => a.act(`fund-${e.actionId}`, `Внесено ${money(left)} ₸ по «${eventTitle(bond, e)}»`, { type: "fund", actionId: e.actionId, amount: left })}>
                        Внести {money(left)} ₸
                      </Btn>
                      {e.funded === 0 && e.kind === KIND.COUPON && (
                        <Btn
                          a={a}
                          id={`fund75-${e.actionId}`}
                          className="btn ghost"
                          title="Для демо дефолта"
                          onClick={() => a.act(`fund75-${e.actionId}`, `Внесено 75% по «${eventTitle(bond, e)}»`, { type: "fund", actionId: e.actionId, amount: Math.floor((left * 3) / 4) })}
                        >
                          Внести 75%
                        </Btn>
                      )}
                    </div>
                  </div>
                );
              })
            : null}
        </div>
        <div>
          <h4>Частичное досрочное погашение</h4>
          {future.length === 0 ? (
            <p className="muted">Будущих купонов не осталось.</p>
          ) : (
            <>
              <p className="muted small">Проводится в дату будущего купона. Деньги вносятся сразу при объявлении, следующие купоны пересчитываются от нового номинала.</p>
              <div className="form-row">
                <label>
                  В дату
                  <select value={target} onChange={(ev) => setCoupon(Number(ev.target.value))}>
                    {future.map((e) => (
                      <option key={e.actionId} value={e.actionId}>
                        {eventTitle(bond, e)} · {dateTime(e.payTs)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Доля, %
                  <input type="number" min={1} max={Math.floor(bond.factorBps / 100) - 1} value={pct} onChange={(ev) => setPct(Number(ev.target.value))} />
                </label>
              </div>
              <p className="muted small">
                Нужно внести: {money(((bond.faceValue * pct * 100) / 10_000) * bond.issuedUnits)} ₸
              </p>
              <Btn
                a={a}
                id="pr"
                disabled={!bond.subscriptionClosed && bond.now < bond.subscriptionEndTs}
                onClick={() => a.act("pr", `Объявлена амортизация ${pct}% и внесены деньги`, { type: "declarePartialRedemption", couponActionId: target, bps: pct * 100 })}
              >
                Объявить и оплатить
              </Btn>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ investor

export function InvestorPanel({ bond, a, who, setWho }: { bond: BondView; a: Act; who: Investor; setWho: (w: Investor) => void }) {
  const investors = bond.demo?.investors ?? [];
  const me = investors.find((i) => i.key === who) ?? investors[0];
  const holder = bond.holders.find((h) => h.owner === me?.address);
  const [to, setTo] = useState<string>("");
  const [units, setUnits] = useState(10);
  const [subUnits, setSubUnits] = useState(100);
  if (!me) return null;

  const others = investors.filter((i) => i.key !== me.key);
  const recipient = to || others[0]?.address;
  const maturity = bond.events.find((e) => e.kind === KIND.MATURITY);
  const transfersOpen = maturity ? bond.now < maturity.recordTs : true;
  const subscribing = !bond.subscriptionClosed && bond.now < bond.subscriptionEndTs;

  const claimable = bond.events
    .filter((e) => e.kind !== KIND.MATURITY && e.recordTs <= bond.now)
    .map((e) => {
      const units = holder?.unitsAt[e.pos] ?? 0;
      const claim = bond.claims.find((c) => c.owner === me.address && c.actionId === e.actionId);
      return { e, units, claim, amount: units * e.amountPerUnit };
    })
    .filter((x) => x.units > 0);

  const canRedeem = maturity && bond.now >= maturity.payTs && maturity.status === STATUS.FUNDED && (holder?.balance ?? 0) > 0;

  return (
    <section className="card role-panel">
      <div className="card-h">
        <h2>Кабинет инвестора</h2>
        <div className="seg" role="group" aria-label="Инвестор">
          {investors.map((i) => (
            <button key={i.key} aria-pressed={i.key === me.key} onClick={() => setWho(i.key)}>
              {label(i.address)}
            </button>
          ))}
        </div>
      </div>
      <div className="card-b panel-grid">
        <div>
          <div className="mini-kpis">
            <div>
              <div className="muted small">Облигаций</div>
              <div className="big">{count(holder?.balance ?? 0)}</div>
            </div>
            <div>
              <div className="muted small">На счёте</div>
              <div className="big">{money(me.tkzt)} ₸</div>
            </div>
          </div>
          {!holder?.allowed && <p className="red small">Регистратор ещё не допустил этот кошелёк.</p>}
          <h4>Выплаты</h4>
          {claimable.length === 0 && <p className="muted">Пока нет зафиксированных выплат.</p>}
          {claimable.map(({ e, units, claim, amount }) => {
            const st = uiStatus(bond, e);
            return (
              <div className="act-row" key={e.pos}>
                <div>
                  <div className="ev-name">{eventTitle(bond, e)}</div>
                  <div className="muted small">
                    {count(units)} обл. × {money(e.amountPerUnit)} ₸ = {money(amount)} ₸
                  </div>
                </div>
                <div className="btns">
                  {claim ? (
                    <span className="st paid">Получено</span>
                  ) : st === "paying" ? (
                    <Btn a={a} id={`claim-${e.actionId}`} onClick={() => a.act(`claim-${e.actionId}`, `Получено ${money(amount)} ₸ по «${eventTitle(bond, e)}»`, { type: "claim", who: me.key, actionId: e.actionId })}>
                      Получить {money(amount)} ₸
                    </Btn>
                  ) : st === "default" || st === "overdue" ? (
                    <span className="st default">Ждёт денег эмитента</span>
                  ) : (
                    <span className="st planned">с {dateTime(e.payTs)}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div>
          {subscribing && (
            <>
              <h4>Подписка</h4>
              <div className="form-row">
                <label>
                  Облигаций
                  <input type="number" min={1} value={subUnits} onChange={(ev) => setSubUnits(Number(ev.target.value))} />
                </label>
              </div>
              <p className="muted small">К оплате: {money(bond.faceValue * subUnits)} ₸</p>
              <Btn a={a} id="sub" onClick={() => a.act("sub", `Подписка на ${subUnits} обл.`, { type: "subscribe", who: me.key, units: subUnits })}>
                Подписаться
              </Btn>
            </>
          )}
          <h4>Перевод облигаций</h4>
          {transfersOpen ? (
            <>
              <div className="form-row">
                <label>
                  Кому
                  <select value={recipient} onChange={(ev) => setTo(ev.target.value)}>
                    {others.map((i) => (
                      <option key={i.key} value={i.address}>
                        {label(i.address)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Облигаций
                  <input type="number" min={1} value={units} onChange={(ev) => setUnits(Number(ev.target.value))} />
                </label>
              </div>
              <TransferHint bond={bond} />
              <Btn a={a} id="tr" disabled={!holder?.balance} onClick={() => a.act("tr", `${count(units)} обл. переведено: ${label(recipient)}`, { type: "transfer", who: me.key, to: recipient, units })}>
                Перевести
              </Btn>
            </>
          ) : (
            <p className="muted">После даты фиксации погашения переводы закрыты.</p>
          )}
          {maturity && (
            <>
              <h4>Погашение</h4>
              {canRedeem ? (
                <Btn a={a} id="redeem" onClick={() => a.act("redeem", "Облигации сданы, номинал получен", { type: "redeem", who: me.key })}>
                  Сдать облигации и получить номинал
                </Btn>
              ) : (
                <p className="muted small">
                  {(holder?.balance ?? 0) === 0 && bond.now >= maturity.payTs
                    ? "Облигации погашены."
                    : `Доступно с ${dateTime(maturity.payTs)}${maturity.status !== STATUS.FUNDED ? ", когда эмитент внесёт номинал" : ""}.`}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}

/** Explains which payout a transfer made now would move. */
function TransferHint({ bond }: { bond: BondView }) {
  const window = bond.events.find((e) => e.recordTs <= bond.now && bond.now < e.payTs);
  const next = bond.events.find((e) => bond.now < e.recordTs);
  if (window) return <p className="small amber">Реестр для «{eventTitle(bond, window)}» уже зафиксирован — эта выплата останется у вас.</p>;
  if (next) return <p className="small muted">До фиксации «{eventTitle(bond, next)}» — выплата перейдёт получателю.</p>;
  return null;
}

// ------------------------------------------------------------------ registrar

export function OperatorPanel({ bond, a }: { bond: BondView; a: Act }) {
  const [addr, setAddr] = useState("");
  const valid = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr.trim());
  return (
    <section className="card role-panel">
      <div className="card-h">
        <h2>Кабинет регистратора</h2>
        <span className="hint">допуск держателей к выпуску</span>
      </div>
      <div className="card-b panel-grid">
        <div>
          <h4>Допущенные держатели</h4>
          {bond.holders.map((h) => (
            <div className="act-row" key={h.owner}>
              <div>
                <div className="ev-name">{label(h.owner)}</div>
                <div className="addr">{short(h.owner)}</div>
              </div>
              <span className={`st ${h.allowed ? "paid" : "default"}`}>{h.allowed ? "Допущен" : "Отозван"}</span>
            </div>
          ))}
        </div>
        <div>
          <h4>Допустить кошелёк</h4>
          <p className="muted small">В демо KYC симулирован: регистратор просто вносит адрес. Без допуска кошелёк не может купить или получить облигации.</p>
          <div className="form-row">
            <label style={{ flex: 1 }}>
              Адрес Solana
              <input value={addr} onChange={(ev) => setAddr(ev.target.value)} placeholder="например, 7xKX…" />
            </label>
          </div>
          <Btn a={a} id="allow" disabled={!valid} onClick={() => a.act("allow", `Допущен ${short(addr.trim())}`, { type: "allow", owner: addr.trim() })}>
            Допустить
          </Btn>
          <p className="muted small" style={{ marginTop: 12 }}>
            Отзыв допуска и банковские выплаты — в следующей версии программы.
          </p>
        </div>
      </div>
    </section>
  );
}
