"use client";

import { useEffect, useState } from "react";
import type { BondSummary } from "@/lib/chain";
import { issuerOf } from "@/lib/demo";
import { LangSwitch, useT } from "@/lib/i18n";
import type { T } from "@/lib/i18n-core";
import { KIND, count, dateTime, money, short } from "@/lib/view";
import { NewBondButton } from "./NewBondButton";

type Status = "subscription" | "debt" | "live" | "matured";
const STATUS: Record<Status, [string, string]> = {
  subscription: ["Подписка", "planned"],
  debt: ["Долг эмитента", "default"],
  live: ["В обращении", "paid"],
  matured: ["Погашен", "planned"],
};

function statusOf(b: BondSummary): Status {
  if (b.subscriptionOpen) return "subscription";
  if (b.debtEvents > 0) return "debt";
  if (b.supply === 0) return "matured";
  return "live";
}

function nextText(b: BondSummary, t: T) {
  if (!b.next) return "—";
  const kind = b.next.kind === KIND.MATURITY ? "maturity" : b.next.kind === KIND.PARTIAL_REDEMPTION ? "amortization" : "coupon";
  const text = {
    record: { coupon: "фиксация купона", amortization: "фиксация амортизации", maturity: "фиксация погашения" },
    pay: { coupon: "выплата купона", amortization: "выплата амортизации", maturity: "выплата погашения" },
  }[b.next.what === "record" ? "record" : "pay"][kind];
  return `${t(text)} · ${dateTime(b.next.ts)}`;
}

export function BondsScreen({ demo }: { demo: boolean }) {
  const t = useT();
  const [data, setData] = useState<{ now: number; bonds: BondSummary[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | Status>("all");

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/bonds", { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => alive && (d.error ? setError(d.error) : (setData(d), setError(null))))
        .catch((e) => alive && setError(String(e)));
    load();
    const t = setInterval(load, 15_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const bonds = (data?.bonds ?? []).filter((b) => filter === "all" || statusOf(b) === filter);
  const counts = (s: Status) => (data?.bonds ?? []).filter((b) => statusOf(b) === s).length;

  return (
    <>
      <header className="top">
        <div className="wrap">
          <a className="brand" href="/" style={{ textDecoration: "none" }}>
            <span className="brand-mark" />
            PRITOK<small>{t("реестр и выплаты")}</small>
          </a>
          <nav className="seg" aria-label={t("Разделы")}>
            <a className="seg-link" aria-current="page" href="/bonds">
              {t("Выпуски")}
            </a>
            <a className="seg-link" href="/">
              {t("Текущий выпуск")}
            </a>
            <a className="seg-link" href="/portfolio">
              {t("Портфель")}
            </a>
          </nav>
          <div className="spacer" />
          {demo && <NewBondButton className="btn ghost small-btn" autoOpen />}
          <LangSwitch />
        </div>
      </header>
      <main className="wrap">
        <section className="card">
          <div className="reg-head">
            <h2>{t("Выпуски облигаций")}</h2>
            <span className="hint">{t("все выпуски программы PRITOK в devnet")}</span>
          </div>
          <div className="reg-head" style={{ paddingTop: 10 }}>
            <div className="seg" role="group" aria-label={t("Фильтр")}>
              {(["all", "subscription", "live", "debt", "matured"] as const).map((f) => (
                <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>
                  {f === "all" ? `${t("Все")} ${data?.bonds.length ?? ""}` : `${t(STATUS[f][0])} ${counts(f)}`}
                </button>
              ))}
            </div>
          </div>
          <div className="card-b scroll">
            {!data && <div className="empty">{error ? t("Не удалось загрузить: {error}", { error: t(error) }) : t("Загружаем выпуски из devnet…")}</div>}
            {data && (
              <table>
                <thead>
                  <tr>
                    <th>{t("Эмитент и выпуск")}</th>
                    <th className="r">{t("Ставка")}</th>
                    <th className="r">{t("Номинал")}</th>
                    <th className="r">{t("В обращении")}</th>
                    <th>{t("Ближайшее событие")}</th>
                    <th className="r">{t("Выплачено")}</th>
                    <th>{t("Статус")}</th>
                  </tr>
                </thead>
                <tbody>
                  {bonds.map((b) => {
                    const st = statusOf(b);
                    return (
                      <tr key={b.bond} onClick={() => window.location.assign(`/bond/${b.bond}`)}>
                        <td>
                          <span className="ev-name">{issuerOf(b.issuer, t)}</span>
                          <span className="ev-kind">
                            {short(b.bond)} · {t("размещён {date}", { date: dateTime(b.startTs) })}
                          </span>
                        </td>
                        <td className="r">{b.couponBps / 100}%</td>
                        <td className="r">
                          {money((b.faceValue * b.factorBps) / 10_000)} ₸
                          {b.factorBps !== 10_000 && <span className="of">{t("из {total}", { total: money(b.faceValue) })}</span>}
                        </td>
                        <td className="r">
                          {count(b.supply)}
                          <span className="of">{t("из {total}", { total: count(b.issuedUnits) })}</span>
                        </td>
                        <td className="small">{nextText(b, t)}</td>
                        <td className="r">{money(b.paidOut)} ₸</td>
                        <td>
                          <span className={`st ${STATUS[st][1]}`}>{t(STATUS[st][0])}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </section>
        <footer>
          <span>{t("PRITOK — независимый прототип для трека Superteam Kazakhstan × KASE. Не аффилирован с KASE.")}</span>
        </footer>
      </main>
    </>
  );
}
