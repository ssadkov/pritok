"use client";

import { useEffect, useState } from "react";
import type { BondSummary } from "@/lib/chain";
import { ISSUER_NAME, label } from "@/lib/demo";
import { KIND, dateTime, money, short } from "@/lib/view";
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

function nextText(b: BondSummary) {
  if (!b.next) return "—";
  const what = b.next.kind === KIND.MATURITY ? "погашения" : b.next.kind === KIND.PARTIAL_REDEMPTION ? "амортизации" : "купона";
  return `${b.next.what === "record" ? "фиксация" : "выплата"} ${what} · ${dateTime(b.next.ts)}`;
}

export function BondsScreen({ demo }: { demo: boolean }) {
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
            PRITOK<small>реестр и выплаты</small>
          </a>
          <nav className="seg" aria-label="Разделы">
            <a className="seg-link" aria-current="page" href="/bonds">
              Выпуски
            </a>
            <a className="seg-link" href="/">
              Текущий выпуск
            </a>
            <a className="seg-link" href="/portfolio">
              Портфель
            </a>
          </nav>
          <div className="spacer" />
          {demo && <NewBondButton className="btn ghost small-btn" />}
          <div className="lang">
            KZ · EN · <b>RU</b>
          </div>
        </div>
      </header>
      <main className="wrap">
        <section className="card">
          <div className="reg-head">
            <h2>Выпуски облигаций</h2>
            <span className="hint">все выпуски программы PRITOK в devnet</span>
          </div>
          <div className="reg-head" style={{ paddingTop: 10 }}>
            <div className="seg" role="group" aria-label="Фильтр">
              {(["all", "subscription", "live", "debt", "matured"] as const).map((f) => (
                <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>
                  {f === "all" ? `Все ${data?.bonds.length ?? ""}` : `${STATUS[f][0]} ${counts(f)}`}
                </button>
              ))}
            </div>
          </div>
          <div className="card-b scroll">
            {!data && <div className="empty">{error ? `Не удалось загрузить: ${error}` : "Загружаем выпуски из devnet…"}</div>}
            {data && (
              <table>
                <thead>
                  <tr>
                    <th>Эмитент и выпуск</th>
                    <th className="r">Ставка</th>
                    <th className="r">Номинал</th>
                    <th className="r">В обращении</th>
                    <th>Ближайшее событие</th>
                    <th className="r">Выплачено</th>
                    <th>Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {bonds.map((b) => {
                    const st = statusOf(b);
                    return (
                      <tr key={b.bond} onClick={() => window.location.assign(`/bond/${b.bond}`)}>
                        <td>
                          <span className="ev-name">{ISSUER_NAME[b.issuer] ?? label(b.issuer)}</span>
                          <span className="ev-kind">
                            {short(b.bond)} · размещён {dateTime(b.startTs)}
                          </span>
                        </td>
                        <td className="r">{b.couponBps / 100}%</td>
                        <td className="r">
                          {money((b.faceValue * b.factorBps) / 10_000)} ₸
                          {b.factorBps !== 10_000 && <span className="of">из {money(b.faceValue)}</span>}
                        </td>
                        <td className="r">
                          {b.supply.toLocaleString("ru-RU")}
                          <span className="of">из {b.issuedUnits.toLocaleString("ru-RU")}</span>
                        </td>
                        <td className="small">{nextText(b)}</td>
                        <td className="r">{money(b.paidOut)} ₸</td>
                        <td>
                          <span className={`st ${STATUS[st][1]}`}>{STATUS[st][0]}</span>
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
          <span>PRITOK — независимый прототип для трека Superteam Kazakhstan × KASE. Не аффилирован с KASE.</span>
        </footer>
      </main>
    </>
  );
}
