"use client";

// Platform operator's view of corporate actions: every event of the issue with its
// stage, one command to execute a payout for all holders, and an execution report.
import { useState } from "react";
import { nameOf } from "@/lib/demo";
import { useT } from "@/lib/i18n";
import type { T } from "@/lib/i18n-core";
import { CLAIM, KIND, STATUS, count, dateTime, eventTitle, explorerAddr, money, type BondView, type EventView } from "@/lib/view";
import { Btn, type Act } from "./RolePanels";
import { Term } from "./Tour";

/** Holders of record for an event (current balances before the record date) and their receipts. */
export function executionRows(bond: BondView, e: EventView) {
  const recorded = bond.now >= e.recordTs;
  return bond.holders
    .map((h) => {
      const units = recorded ? (h.unitsAt[e.pos] ?? 0) : h.balance;
      const claim = bond.claims.find((c) => c.owner === h.owner && c.actionId === e.actionId);
      return { owner: h.owner, units, amount: units * e.amountPerUnit, claim };
    })
    .filter((r) => r.units > 0 || r.claim);
}

export type Stage = "scheduled" | "recorded" | "funded" | "executing" | "executed" | "default";

export function stageOf(bond: BondView, e: EventView): Stage {
  const rows = executionRows(bond, e);
  const paid = rows.filter((r) => r.claim).length;
  if (e.status === STATUS.DEFAULTED || (bond.now >= e.payTs && e.funded < e.required)) return "default";
  if (bond.now >= e.payTs && e.status === STATUS.FUNDED) return rows.length && paid >= rows.length ? "executed" : "executing";
  if (e.status === STATUS.FUNDED) return "funded";
  return bond.now >= e.recordTs ? "recorded" : "scheduled";
}

const routeText = (status: number | undefined, t: T) =>
  status === undefined
    ? t("не выплачено")
    : status === CLAIM.PAID
      ? t("на кошелёк")
      : status === CLAIM.BANK_REQUESTED
        ? t("поручение в банк")
        : t("оплачено банком");

function downloadCsv(bond: BondView, e: EventView, t: T) {
  const rows = executionRows(bond, e);
  const lines = [
    ["event", "holder", "wallet", "units", "amount_tkzt", "route", "receipt"].join(","),
    ...rows.map((r) =>
      [
        eventTitle(bond, e, t),
        nameOf(r.owner, t),
        r.owner,
        r.units,
        (r.amount / 100).toFixed(2),
        routeText(r.claim?.status, t),
        r.claim?.address ?? "",
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    ),
  ];
  const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `pritok-${bond.bond.slice(0, 6)}-${e.actionId}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function CorporateActions({ bond, a }: { bond: BondView; a: Act }) {
  const t = useT();
  const [open, setOpen] = useState<number | null>(null);
  const subscribing = !bond.subscriptionClosed && bond.now < bond.subscriptionEndTs;

  return (
    <div className="ca">
      <h4>
        {t("Корпоративные действия выпуска")}{" "}
        <Term tip={t("Оператор ведёт каждое событие от графика до полного исполнения: реестр фиксируется программой, эмитент вносит деньги, оператор одной командой выплачивает всем держателям. Каждая выплата — квитанция в блокчейне.")} />
      </h4>
      {subscribing && <p className="muted small">{t("Идёт подписка — число облигаций и суммы зафиксируются после её закрытия.")}</p>}
      <div className="scroll">
        <table className="ca-table">
          <thead>
            <tr>
              <th>{t("Событие")}</th>
              <th>{t("Реестр")}</th>
              <th>{t("Деньги эмитента")}</th>
              <th>{t("Исполнение")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {bond.events.map((e) => {
              const rows = executionRows(bond, e);
              const paid = rows.filter((r) => r.claim).length;
              const stage = stageOf(bond, e);
              const recorded = bond.now >= e.recordTs;
              const title = eventTitle(bond, e, t);
              return (
                <tr key={e.pos} aria-selected={open === e.pos}>
                  <td>
                    <span className="ev-name">{title}</span>
                    <span className="ev-kind">{t("выплата {date}", { date: dateTime(e.payTs) })}</span>
                  </td>
                  <td>
                    {recorded ? (
                      <span className="st paid">✓ {dateTime(e.recordTs)}</span>
                    ) : (
                      <span className="st planned">{dateTime(e.recordTs)}</span>
                    )}
                  </td>
                  <td>
                    {e.status === STATUS.FUNDED ? (
                      <span className="st paid">✓ {money(e.funded)} ₸</span>
                    ) : (
                      <span className={`st ${stage === "default" ? "default" : "planned"}`}>
                        {money(e.funded)} / {money(e.required)} ₸
                      </span>
                    )}
                  </td>
                  <td>
                    {stage === "executed" ? (
                      <span className="st paid">✓ {t("{paid} из {total}", { paid, total: rows.length })}</span>
                    ) : stage === "default" ? (
                      <span className="st default">{e.status === STATUS.DEFAULTED ? t("дефолт") : t("просрочено")}</span>
                    ) : (
                      <span className="st planned">{t("{paid} из {total}", { paid, total: rows.length })}</span>
                    )}
                  </td>
                  <td className="ca-actions">
                    {stage === "executing" && e.kind !== KIND.MATURITY && (
                      <Btn
                        a={a}
                        id={`exec-${e.actionId}`}
                        onClick={() =>
                          a.act(`exec-${e.actionId}`, t("Выплата «{event}» исполнена: {n} держателей", { event: title, n: rows.length - paid }), {
                            type: "execute",
                            actionId: e.actionId,
                          })
                        }
                      >
                        {t("Исполнить выплату")}
                      </Btn>
                    )}
                    {stage === "executing" && e.kind === KIND.MATURITY && <span className="muted small">{t("держатели сдают облигации")}</span>}
                    {stage === "default" && e.status !== STATUS.DEFAULTED && (
                      <Btn
                        a={a}
                        id={`default-${e.actionId}`}
                        className="btn danger"
                        onClick={() => a.act(`default-${e.actionId}`, t("Технический дефолт зафиксирован"), { type: "markDefault", actionId: e.actionId })}
                      >
                        {t("Зафиксировать дефолт")}
                      </Btn>
                    )}
                    {stage === "funded" && <span className="muted small">{t("ждёт даты выплаты")}</span>}
                    {(stage === "scheduled" || stage === "recorded") && <span className="muted small">{t("ждёт денег эмитента")}</span>}{" "}
                    <button className="linkbtn" onClick={() => setOpen(open === e.pos ? null : e.pos)}>
                      {open === e.pos ? t("Скрыть отчёт") : t("Отчёт")}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {open !== null && bond.events[open] && <ExecutionReport bond={bond} e={bond.events[open]} a={a} />}
    </div>
  );
}

function ExecutionReport({ bond, e, a }: { bond: BondView; e: EventView; a: Act }) {
  const t = useT();
  const rows = executionRows(bond, e);
  const payable = bond.now >= e.payTs && e.status === STATUS.FUNDED && e.kind !== KIND.MATURITY;
  const total = rows.reduce((s, r) => s + r.amount, 0);
  return (
    <div className="ca-report">
      <div className="ca-report-h">
        <b>{t("Отчёт об исполнении · {event}", { event: eventTitle(bond, e, t) })}</b>
        <span className="muted small">
          {bond.now >= e.recordTs ? t("по реестру на {date}", { date: dateTime(e.recordTs) }) : t("предварительно, по текущим балансам")}
        </span>
        <button className="linkbtn" onClick={() => downloadCsv(bond, e, t)}>
          {t("Скачать CSV")}
        </button>
      </div>
      {rows.map((r) => (
        <div className="act-row" key={r.owner}>
          <div>
            <div className="ev-name">{nameOf(r.owner, t)}</div>
            <div className="muted small">
              {t("{n} обл.", { n: count(r.units) })} × {money(e.amountPerUnit)} ₸ = {money(r.amount)} ₸
            </div>
          </div>
          <div className="btns">
            {r.claim ? (
              <a
                className={`st ${r.claim.status === CLAIM.BANK_REQUESTED ? "planned" : "paid"}`}
                href={explorerAddr(r.claim.address, bond.cluster)}
                target="_blank"
                rel="noopener"
              >
                {routeText(r.claim.status, t)} ↗
              </a>
            ) : payable ? (
              <Btn
                a={a}
                id={`bankfor-${r.owner}-${e.actionId}`}
                className="btn ghost"
                title={t("Для держателя без кошелька: доля уходит платёжному агенту для перевода в банк")}
                onClick={() =>
                  a.act(`bankfor-${r.owner}-${e.actionId}`, t("Выплата {who} направлена в банк", { who: nameOf(r.owner, t) }), {
                    type: "bankFor",
                    owner: r.owner,
                    actionId: e.actionId,
                  })
                }
              >
                {t("Через банк")}
              </Btn>
            ) : (
              <span className="st planned">{routeText(undefined, t)}</span>
            )}
          </div>
        </div>
      ))}
      <div className="act-row">
        <b>{t("Итого держателям")}</b>
        <b>
          {money(e.claimed)} / {money(total)} ₸
        </b>
      </div>
    </div>
  );
}
