"use client";

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import { money } from "@/lib/view";

interface Terms {
  faceValue: number;
  couponPct: number;
  coupons: number;
  units: number;
}

const DEFAULTS: Terms = { faceValue: 100_000, couponPct: 16, coupons: 4, units: 1_000 };

/**
 * Opens the issuer's form for a new demo issue: face value, coupon, term and size.
 * The server creates the bond, admits the three demo investors and places it among them.
 */
export function NewBondButton({
  className = "btn",
  label = "Новый демо-выпуск",
  autoOpen = false,
}: {
  className?: string;
  label?: string;
  /** Opens the form on load when the link carries ?new=1. */
  autoOpen?: boolean;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [terms, setTerms] = useState<Terms>(DEFAULTS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (autoOpen && new URLSearchParams(window.location.search).has("new")) setOpen(true);
  }, [autoOpen]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy]);

  const set = (k: keyof Terms) => (ev: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setTerms({ ...terms, [k]: Number(ev.target.value) });

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/demo/bond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(terms),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? res.statusText);
      const role = new URLSearchParams(window.location.search).get("as");
      window.location.assign(`/bond/${data.bond}${role ? `?as=${role}` : ""}`);
    } catch (e) {
      setError(t(String((e as Error).message ?? e)));
      setBusy(false);
    }
  };

  // Mirrors Bond::coupon_per_unit: face × rate / 2, in tiyn, rounded down.
  const face = Math.round(terms.faceValue * 100);
  const coupon = Math.floor((face * Math.round(terms.couponPct * 100)) / 20_000);
  const raised = face * terms.units;
  const couponsTotal = coupon * terms.units * terms.coupons;
  const years = terms.coupons / 2;

  return (
    <span className="new-bond">
      <button className={className} onClick={() => setOpen(true)} title={t("Создать выпуск, допустить инвесторов и разместить облигации. 1 полугодие = 4 минуты")}>
        {t(label)}
      </button>
      {open && (
        <div className="nb-overlay" onClick={() => !busy && setOpen(false)}>
          <div className="nb-dialog card" role="dialog" aria-modal="true" aria-labelledby="nb-title" onClick={(e) => e.stopPropagation()}>
            <div className="card-h">
              <h2 id="nb-title">{t("Новый выпуск облигаций")}</h2>
              <span className="hint">{t("условия задаёт эмитент")}</span>
            </div>
            <div className="card-b">
              <div className="nb-grid">
                <label>
                  {t("Номинал, ₸")}
                  <input type="number" min={1_000} max={10_000_000} step={1_000} value={terms.faceValue} onChange={set("faceValue")} />
                </label>
                <label>
                  {t("Ставка купона, % годовых")}
                  <input type="number" min={0.1} max={50} step={0.1} value={terms.couponPct} onChange={set("couponPct")} />
                </label>
                <label>
                  {t("Срок")}
                  <select value={terms.coupons} onChange={set("coupons")}>
                    {[1, 2, 3, 4].map((n) => (
                      <option key={n} value={n}>
                        {t("{years} г. · купонов: {n}", { n, years: n / 2 })}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t("Объём выпуска, облигаций")}
                  <input type="number" min={10} max={100_000} step={10} value={terms.units} onChange={set("units")} />
                </label>
              </div>
              <div className="deal">
                <div>
                  <span className="muted">{t("Купон на облигацию")}</span> <b>{money(coupon)} ₸</b> {t("раз в полгода")}
                </div>
                <div>
                  <span className="muted">{t("Эмитент привлечёт")}</span> <b>{money(raised)} ₸</b>
                </div>
                <div>
                  <span className="muted">{t("Вернёт держателям")}</span>{" "}
                  {t("купоны {coupons} ₸ + номинал {face} ₸ за {years} г.", { coupons: money(couponsTotal), face: money(raised), years })}
                </div>
              </div>
              <p className="muted small">
                {t("Выпуск размещается среди трёх демо-инвесторов: 30%, 20% и 50%. Время ускорено: полгода проходят за 4 минуты.")}
              </p>
              {error && <p className="red small">{error}</p>}
              <div className="btns">
                <button className="btn" disabled={busy} onClick={start}>
                  {busy ? t("Создаём выпуск… ~20 с") : t("Создать выпуск")}
                </button>
                <button className="btn ghost" disabled={busy} onClick={() => setOpen(false)}>
                  {t("Отмена")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </span>
  );
}
