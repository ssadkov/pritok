"use client";

import { useState } from "react";
import { nameOf } from "@/lib/demo";
import { useT } from "@/lib/i18n";
import { Term } from "./Tour";
import {
  CLAIM,
  KIND,
  STATUS,
  accruedPerUnit,
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
  const t = useT();
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
      setResult(
        !res.ok
          ? { ok: false, text: t(data.error ?? "Ошибка") }
          : data.pending
            ? { ok: true, text: t("{text} — отправлено, devnet подтверждает дольше обычного", { text }), sig: data.sig }
            : { ok: true, text, sig: data.sig },
      );
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
  const t = useT();
  if (!a.result) return null;
  const r = a.result;
  return (
    <div className={`toast ${r.ok ? "ok" : "err"}`} role="status">
      <div>
        <b>{r.ok ? t("Готово") : t("Отклонено")}</b> · {r.text}
      </div>
      {r.sig && (
        <a href={explorerTx(r.sig, bond.cluster)} target="_blank" rel="noopener">
          {t("транзакция")} ↗
        </a>
      )}
      <button onClick={a.clear} aria-label={t("Закрыть")}>
        ×
      </button>
    </div>
  );
}

function Btn({ a, id, children, ...rest }: { a: Act; id: string; children: React.ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const t = useT();
  return (
    <button className="btn" disabled={!!a.busy || rest.disabled} {...rest}>
      {a.busy === id ? t("Отправляем…") : children}
    </button>
  );
}

// ------------------------------------------------------------------ issuer

export function IssuerPanel({ bond, a }: { bond: BondView; a: Act }) {
  const t = useT();
  const open = bond.events.filter((e) => e.funded < e.required);
  const future = bond.events.filter((e) => e.kind === KIND.COUPON && e.recordTs > bond.now);
  const [coupon, setCoupon] = useState<number | "">("");
  const [pct, setPct] = useState(20);
  const target = coupon === "" ? future[0]?.actionId : coupon;
  const subscribing = !bond.subscriptionClosed && bond.now < bond.subscriptionEndTs;

  return (
    <section className="card role-panel">
      <div className="card-h">
        <h2>{t("Кабинет эмитента")}</h2>
        <span className="hint">
          {nameOf(bond.issuer, t)} · {t("на счёте {amount} tKZT", { amount: money(bond.demo?.issuerTkzt ?? 0) })}
        </span>
      </div>
      <div className="card-b panel-grid">
        <div>
          <h4>{t("К оплате")}</h4>
          {subscribing && <p className="muted">{t("Идёт подписка — суммы к оплате появятся после её закрытия.")}</p>}
          {open.length === 0 && <p className="muted">{t("Все обязательства профинансированы.")}</p>}
          {!subscribing
            ? open.map((e) => {
                const left = e.required - e.funded;
                const st = uiStatus(bond, e);
                const event = eventTitle(bond, e, t);
                return (
                  <div className="act-row" key={e.pos}>
                    <div>
                      <div className="ev-name">{event}</div>
                      <div className="muted small">
                        {t("осталось {left} ₸ · выплата {date}", { left: money(left), date: dateTime(e.payTs) })}
                        {st === "overdue" && <span className="red"> · {t("просрочено")}</span>}
                        {st === "default" && <span className="red"> · {t("дефолт")}</span>}
                      </div>
                    </div>
                    <div className="btns">
                      <Btn
                        a={a}
                        id={`fund-${e.actionId}`}
                        onClick={() =>
                          a.act(`fund-${e.actionId}`, t("Внесено {amount} ₸ по «{event}»", { amount: money(left), event }), {
                            type: "fund",
                            actionId: e.actionId,
                            amount: left,
                          })
                        }
                      >
                        {t("Внести {amount} ₸", { amount: money(left) })}
                      </Btn>
                      {e.funded === 0 && e.kind === KIND.COUPON && (
                        <Btn
                          a={a}
                          id={`fund75-${e.actionId}`}
                          className="btn ghost"
                          title={t("Для демо дефолта")}
                          onClick={() =>
                            a.act(`fund75-${e.actionId}`, t("Внесено 75% по «{event}»", { event }), {
                              type: "fund",
                              actionId: e.actionId,
                              amount: Math.floor((left * 3) / 4),
                            })
                          }
                        >
                          {t("Внести 75%")}
                        </Btn>
                      )}
                    </div>
                  </div>
                );
              })
            : null}
        </div>
        <div>
          <h4>
            {t("Частичное досрочное погашение")}{" "}
            <Term tip={t("Амортизация: компания возвращает часть номинала раньше срока. Номинал облигации уменьшается, следующие купоны считаются от нового номинала.")} />
          </h4>
          {future.length === 0 ? (
            <p className="muted">{t("Будущих купонов не осталось.")}</p>
          ) : (
            <>
              <p className="muted small">
                {t("Проводится в дату будущего купона. Деньги вносятся сразу при объявлении, следующие купоны пересчитываются от нового номинала.")}
              </p>
              <div className="form-row">
                <label>
                  {t("В дату")}
                  <select value={target} onChange={(ev) => setCoupon(Number(ev.target.value))}>
                    {future.map((e) => (
                      <option key={e.actionId} value={e.actionId}>
                        {eventTitle(bond, e, t)} · {dateTime(e.payTs)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t("Доля, %")}
                  <input type="number" min={1} max={Math.floor(bond.factorBps / 100) - 1} value={pct} onChange={(ev) => setPct(Number(ev.target.value))} />
                </label>
              </div>
              <p className="muted small">
                {t("Нужно внести: {amount} ₸", { amount: money(((bond.faceValue * pct * 100) / 10_000) * bond.issuedUnits) })}
              </p>
              <Btn
                a={a}
                id="pr"
                disabled={subscribing}
                onClick={() =>
                  a.act("pr", t("Объявлена амортизация {pct}% и внесены деньги", { pct }), {
                    type: "declarePartialRedemption",
                    couponActionId: target,
                    bps: pct * 100,
                  })
                }
              >
                {t("Объявить и оплатить")}
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
  const t = useT();
  const investors = bond.demo?.investors ?? [];
  const me = investors.find((i) => i.key === who) ?? investors[0];
  const holder = bond.holders.find((h) => h.owner === me?.address);
  const [to, setTo] = useState<string>("");
  const [units, setUnits] = useState(10);
  const [subUnits, setSubUnits] = useState(100);
  const [sellTo, setSellTo] = useState<Investor | "">("");
  const [sellUnits, setSellUnits] = useState(10);
  const [pricePct, setPricePct] = useState(99);
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
        <h2>
          {t("Кабинет инвестора")}{" "}
          <a className="seg-link" href={`/portfolio/${me.address}`} style={{ fontSize: 13 }}>
            {t("Мой портфель")} →
          </a>
        </h2>
        <div className="seg" role="group" aria-label={t("Инвестор")}>
          {investors.map((i) => (
            <button key={i.key} aria-pressed={i.key === me.key} onClick={() => setWho(i.key)}>
              {nameOf(i.address, t)}
            </button>
          ))}
        </div>
      </div>
      <div className="card-b panel-grid">
        <div>
          <div className="mini-kpis">
            <div>
              <div className="muted small">{t("Облигаций")}</div>
              <div className="big">{count(holder?.balance ?? 0)}</div>
            </div>
            <div>
              <div className="muted small">{t("На счёте")}</div>
              <div className="big">{money(me.tkzt)} ₸</div>
            </div>
          </div>
          {!holder?.allowed && <p className="red small">{t("Регистратор ещё не допустил этот кошелёк.")}</p>}
          <PayoutCalendar bond={bond} balance={holder?.balance ?? 0} />
          <h4>{t("Выплаты")}</h4>
          {claimable.length === 0 && <p className="muted">{t("Пока нет зафиксированных выплат.")}</p>}
          {claimable.map(({ e, units, claim, amount }) => {
            const st = uiStatus(bond, e);
            const event = eventTitle(bond, e, t);
            return (
              <div className="act-row" key={e.pos}>
                <div>
                  <div className="ev-name">{event}</div>
                  <div className="muted small">
                    {t("{n} обл.", { n: count(units) })} × {money(e.amountPerUnit)} ₸ = {money(amount)} ₸
                  </div>
                </div>
                <div className="btns">
                  {claim ? (
                    <span className={`st ${claim.status === CLAIM.BANK_REQUESTED ? "planned" : "paid"}`}>
                      {claim.status === CLAIM.PAID ? t("На кошельке") : claim.status === CLAIM.BANK_REQUESTED ? t("Ждёт банка") : t("Оплачено банком")}
                    </span>
                  ) : st === "paying" ? (
                    <>
                      <Btn
                        a={a}
                        id={`claim-${e.actionId}`}
                        onClick={() =>
                          a.act(`claim-${e.actionId}`, t("Получено {amount} ₸ по «{event}»", { amount: money(amount), event }), {
                            type: "claim",
                            who: me.key,
                            actionId: e.actionId,
                          })
                        }
                      >
                        {t("Получить {amount} ₸", { amount: money(amount) })}
                      </Btn>
                      <Btn
                        a={a}
                        id={`bank-${e.actionId}`}
                        className="btn ghost"
                        title={t("Доля уйдёт платёжному агенту, он переведёт тенге на банковский счёт")}
                        onClick={() =>
                          a.act(`bank-${e.actionId}`, t("Выплата {amount} ₸ направлена в банк", { amount: money(amount) }), {
                            type: "claimToBank",
                            who: me.key,
                            actionId: e.actionId,
                          })
                        }
                      >
                        {t("В банк")}
                      </Btn>
                    </>
                  ) : st === "default" || st === "overdue" ? (
                    <span className="st default">{t("Ждёт денег эмитента")}</span>
                  ) : (
                    <span className="st planned">{t("с {date}", { date: dateTime(e.payTs) })}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div>
          {subscribing && (
            <>
              <h4>{t("Подписка")}</h4>
              <div className="form-row">
                <label>
                  {t("Облигаций")}
                  <input type="number" min={1} value={subUnits} onChange={(ev) => setSubUnits(Number(ev.target.value))} />
                </label>
              </div>
              <p className="muted small">{t("К оплате: {amount} ₸", { amount: money(bond.faceValue * subUnits) })}</p>
              <Btn
                a={a}
                id="sub"
                onClick={() => a.act("sub", t("Подписка на {n} обл.", { n: subUnits }), { type: "subscribe", who: me.key, units: subUnits })}
              >
                {t("Подписаться")}
              </Btn>
            </>
          )}
          <SaleForm
            bond={bond}
            a={a}
            me={me.key}
            others={others}
            balance={holder?.balance ?? 0}
            open={transfersOpen}
            buyer={sellTo || others[0]?.key}
            setBuyer={setSellTo}
            units={sellUnits}
            setUnits={setSellUnits}
            pricePct={pricePct}
            setPricePct={setPricePct}
          />
          <h4>{t("Перевод без оплаты")}</h4>
          {transfersOpen ? (
            <>
              <div className="form-row">
                <label>
                  {t("Кому")}
                  <select value={recipient} onChange={(ev) => setTo(ev.target.value)}>
                    {others.map((i) => (
                      <option key={i.key} value={i.address}>
                        {nameOf(i.address, t)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t("Облигаций")}
                  <input type="number" min={1} value={units} onChange={(ev) => setUnits(Number(ev.target.value))} />
                </label>
              </div>
              <TransferHint bond={bond} />
              <Btn
                a={a}
                id="tr"
                disabled={!holder?.balance}
                onClick={() =>
                  a.act("tr", t("{n} обл. переведено: {to}", { n: count(units), to: nameOf(recipient, t) }), {
                    type: "transfer",
                    who: me.key,
                    to: recipient,
                    units,
                  })
                }
              >
                {t("Перевести")}
              </Btn>
            </>
          ) : (
            <p className="muted">{t("После даты фиксации погашения переводы закрыты.")}</p>
          )}
          {maturity && (
            <>
              <h4>{t("Погашение")}</h4>
              {canRedeem ? (
                <Btn a={a} id="redeem" onClick={() => a.act("redeem", t("Облигации сданы, номинал получен"), { type: "redeem", who: me.key })}>
                  {t("Сдать облигации и получить номинал")}
                </Btn>
              ) : (
                <p className="muted small">
                  {(holder?.balance ?? 0) === 0 && bond.now >= maturity.payTs
                    ? t("Облигации погашены.")
                    : maturity.status !== STATUS.FUNDED
                      ? t("Доступно с {date}, когда эмитент внесёт номинал.", { date: dateTime(maturity.payTs) })
                      : t("Доступно с {date}.", { date: dateTime(maturity.payTs) })}
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
  const t = useT();
  const window = bond.events.find((e) => e.recordTs <= bond.now && bond.now < e.payTs);
  const next = bond.events.find((e) => bond.now < e.recordTs);
  if (window)
    return (
      <p className="small amber">
        {t("Реестр для «{event}» уже зафиксирован — эта выплата останется у вас.", { event: eventTitle(bond, window, t) })}
      </p>
    );
  if (next)
    return <p className="small muted">{t("До фиксации «{event}» — выплата перейдёт получателю.", { event: eventTitle(bond, next, t) })}</p>;
  return null;
}

// ------------------------------------------------------------------ registrar

export function OperatorPanel({ bond, a }: { bond: BondView; a: Act }) {
  const t = useT();
  const [addr, setAddr] = useState("");
  const [refs, setRefs] = useState<Record<string, string>>({});
  const valid = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr.trim());
  const bankQueue = bond.claims.filter((c) => c.status === CLAIM.BANK_REQUESTED);
  const bankDone = bond.claims.filter((c) => c.status === CLAIM.BANK_CONFIRMED);
  const title = (actionId: number) => {
    const e = bond.events.find((x) => x.actionId === actionId);
    return e ? eventTitle(bond, e, t) : `#${actionId}`;
  };

  return (
    <section className="card role-panel">
      <div className="card-h">
        <h2>
          {t("Кабинет регистратора и платёжного агента")}{" "}
          <Term tip={t("Регистратор ведёт реестр: допускает инвесторов (KYC) и может приостановить операции. Платёжный агент проводит выплаты через банк тем, кто не получает на кошелёк.")} />
        </h2>
        <div className="btns">
          {bond.paused ? (
            <Btn a={a} id="unpause" onClick={() => a.act("unpause", t("Операции возобновлены"), { type: "pause", paused: false })}>
              {t("Возобновить операции")}
            </Btn>
          ) : (
            <Btn a={a} id="pause" className="btn danger" onClick={() => a.act("pause", t("Подписка и переводы приостановлены"), { type: "pause", paused: true })}>
              {t("Приостановить операции")}
            </Btn>
          )}
        </div>
      </div>
      <div className="card-b panel-grid">
        <div>
          <h4>{t("Банковские выплаты к подтверждению")}</h4>
          {bankQueue.length === 0 && <p className="muted">{t("Поручений нет. Держатель выбирает «В банк» в своём кабинете.")}</p>}
          {bankQueue.map((c) => {
            const k = `${c.owner}-${c.actionId}`;
            return (
              <div className="act-row" key={k}>
                <div>
                  <div className="ev-name">
                    {nameOf(c.owner, t)} · {money(c.amount)} ₸
                  </div>
                  <div className="muted small">
                    {title(c.actionId)} · {t("деньги уже у платёжного агента")}
                  </div>
                </div>
                <div className="btns">
                  <input
                    className="ref-input"
                    placeholder={t("№ платёжки")}
                    value={refs[k] ?? ""}
                    onChange={(ev) => setRefs({ ...refs, [k]: ev.target.value })}
                  />
                  <Btn
                    a={a}
                    id={`confirm-${k}`}
                    disabled={!(refs[k] ?? "").trim()}
                    onClick={() =>
                      a.act(`confirm-${k}`, t("Банковский перевод {who} подтверждён", { who: nameOf(c.owner, t) }), {
                        type: "confirmBank",
                        owner: c.owner,
                        actionId: c.actionId,
                        reference: refs[k],
                      })
                    }
                  >
                    {t("Подтвердить")}
                  </Btn>
                </div>
              </div>
            );
          })}
          {bankDone.length > 0 && (
            <>
              <h4>{t("Подтверждено")}</h4>
              {bankDone.map((c) => (
                <div className="act-row" key={`${c.owner}-${c.actionId}`}>
                  <div>
                    <div className="ev-name">
                      {nameOf(c.owner, t)} · {money(c.amount)} ₸
                    </div>
                    <div className="addr" title={t("В блокчейне хранится только хеш номера платёжки")}>
                      {title(c.actionId)} · {t("хеш")} {c.bankRefHash?.slice(0, 12)}…
                    </div>
                  </div>
                  <span className="st paid">{t("Оплачено банком")}</span>
                </div>
              ))}
            </>
          )}
          <p className="muted small" style={{ marginTop: 12 }}>
            {t("Банковский перевод симулирован: подтверждение — заявление платёжного агента. В реальной интеграции нужна сверка с выпиской банка.")}
          </p>
        </div>
        <div>
          <h4>{t("Держатели")}</h4>
          {bond.holders.map((h) => (
            <div className="act-row" key={h.owner}>
              <div>
                <div className="ev-name">{nameOf(h.owner, t)}</div>
                <div className="addr">{short(h.owner)}</div>
              </div>
              <div className="btns">
                <span className={`st ${h.allowed ? "paid" : "default"}`}>{h.allowed ? t("Допущен") : t("Допуск отозван")}</span>
                {h.allowed ? (
                  <Btn
                    a={a}
                    id={`revoke-${h.owner}`}
                    className="btn ghost"
                    onClick={() => a.act(`revoke-${h.owner}`, t("Допуск {who} отозван", { who: nameOf(h.owner, t) }), { type: "revoke", owner: h.owner })}
                  >
                    {t("Отозвать")}
                  </Btn>
                ) : (
                  <Btn
                    a={a}
                    id={`allow-${h.owner}`}
                    className="btn ghost"
                    onClick={() => a.act(`allow-${h.owner}`, t("Допуск {who} восстановлен", { who: nameOf(h.owner, t) }), { type: "allow", owner: h.owner })}
                  >
                    {t("Допустить снова")}
                  </Btn>
                )}
              </div>
            </div>
          ))}
          <p className="muted small">{t("Отзыв запрещает получать облигации. Уже зафиксированные выплаты держатель получит.")}</p>
          <h4>{t("Допустить новый кошелёк")}</h4>
          <div className="form-row">
            <label style={{ flex: 1 }}>
              {t("Адрес Solana")}
              <input value={addr} onChange={(ev) => setAddr(ev.target.value)} placeholder={t("например, 7xKX…")} />
            </label>
          </div>
          <Btn
            a={a}
            id="allow"
            disabled={!valid}
            onClick={() => a.act("allow", t("Допущен {who}", { who: short(addr.trim()) }), { type: "allow", owner: addr.trim() })}
          >
            {t("Допустить")}
          </Btn>
        </div>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ sale (DvP)

function SaleForm({
  bond,
  a,
  me,
  others,
  balance,
  open,
  buyer,
  setBuyer,
  units,
  setUnits,
  pricePct,
  setPricePct,
}: {
  bond: BondView;
  a: Act;
  me: Investor;
  others: { key: Investor; address: string; tkzt: number }[];
  balance: number;
  open: boolean;
  buyer: Investor | undefined;
  setBuyer: (b: Investor) => void;
  units: number;
  setUnits: (n: number) => void;
  pricePct: number;
  setPricePct: (n: number) => void;
}) {
  const t = useT();
  const q = accruedPerUnit(bond, bond.now);
  const buyerInfo = others.find((o) => o.key === buyer);
  return (
    <>
      <h4>
        {t("Продажа облигаций")}{" "}
        <Term tip={t("Поставка против оплаты: облигации уходят покупателю, деньги — продавцу в одной транзакции, одно без другого невозможно. Цену в % от номинала задают стороны, НКД — накопленный купонный доход — считает программа.")} />
      </h4>
      {!open || !q ? (
        <p className="muted">{t("После даты фиксации погашения сделки закрыты.")}</p>
      ) : (
        <>
          <div className="form-row">
            <label>
              {t("Покупатель")}
              <select value={buyer} onChange={(ev) => setBuyer(ev.target.value as Investor)}>
                {others.map((i) => (
                  <option key={i.key} value={i.key}>
                    {nameOf(i.address, t)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("Облигаций")}
              <input type="number" min={1} value={units} onChange={(ev) => setUnits(Number(ev.target.value))} />
            </label>
            <label>
              {t("Цена, % номинала")}
              <input type="number" min={1} max={150} step={0.1} value={pricePct} onChange={(ev) => setPricePct(Number(ev.target.value))} />
            </label>
          </div>
          {(() => {
            const clean = Math.floor((q.face * Math.round(pricePct * 100)) / 10_000);
            const perUnit = clean + q.accrued;
            const total = perUnit * units;
            return (
              <div className="deal">
                <div>
                  <span className="muted">{t("Цена")}</span> {money(q.face)} × {pricePct}% = <b>{money(clean)} ₸</b>
                </div>
                <div>
                  <span className="muted">{t("НКД")}</span>{" "}
                  {q.accrued ? (
                    <b>{money(q.accrued)} ₸</b>
                  ) : (
                    <span className="amber">{t("0 — реестр для ближайшего купона зафиксирован, купон останется у продавца")}</span>
                  )}
                </div>
                <div className="deal-total">
                  {t("За облигацию {unit} ₸ · итого", { unit: money(perUnit) })} <b>{money(total)} ₸</b>
                </div>
                {buyerInfo && buyerInfo.tkzt < total && (
                  <div className="red small">{t("У покупателя на счёте {amount} ₸ — не хватит.", { amount: money(buyerInfo.tkzt) })}</div>
                )}
              </div>
            );
          })()}
          <Btn
            a={a}
            id="sell"
            disabled={!balance || !buyer}
            onClick={() =>
              a.act("sell", t("Сделка: {n} обл. по {pct}% + НКД", { n: count(units), pct: pricePct }), {
                type: "trade",
                who: me,
                buyer,
                units,
                priceBps: Math.round(pricePct * 100),
              })
            }
          >
            {t("Продать — поставка против оплаты")}
          </Btn>
          <p className="muted small" style={{ marginTop: 8 }}>
            {t("В демо обе подписи ставит сервер; в жизни продавец и покупатель подписывают одну транзакцию каждый у себя.")}
          </p>
        </>
      )}
    </>
  );
}

// ------------------------------------------------------------------ payout calendar

/** What the investor will receive and when, at the current balance. */
function PayoutCalendar({ bond, balance }: { bond: BondView; balance: number }) {
  const t = useT();
  const upcoming = bond.events.filter((e) => e.payTs > bond.now);
  if (!upcoming.length || !balance) return null;
  const total = upcoming.reduce((s, e) => s + e.amountPerUnit * balance, 0);
  return (
    <>
      <h4>{t("Календарь выплат")}</h4>
      <div className="calendar">
        {upcoming.map((e) => (
          <div className="cal-row" key={e.pos}>
            <span className="when">{dateTime(e.payTs)}</span>
            <span>{eventTitle(bond, e, t)}</span>
            <b>{money(e.amountPerUnit * balance)} ₸</b>
          </div>
        ))}
        <div className="cal-row total">
          <span />
          <span>{t("Всего впереди при текущем балансе")}</span>
          <b>{money(total)} ₸</b>
        </div>
      </div>
    </>
  );
}
