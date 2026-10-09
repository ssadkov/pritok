"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n";

/** Starts a fresh demo issue (created, admitted and placed on the server) and opens it. */
export function NewBondButton({ className = "btn", label = "Новый демо-выпуск" }: { className?: string; label?: string }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/demo/bond", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? res.statusText);
      const role = new URLSearchParams(window.location.search).get("as");
      window.location.assign(`/bond/${data.bond}${role ? `?as=${role}` : ""}`);
    } catch (e) {
      setError(t(String((e as Error).message ?? e)));
      setBusy(false);
    }
  };
  return (
    <span className="new-bond">
      <button className={className} disabled={busy} onClick={start} title={t("Создать выпуск, допустить инвесторов и разместить облигации. 1 полугодие = 4 минуты")}>
        {busy ? t("Создаём выпуск… ~20 с") : t(label)}
      </button>
      {error && <span className="red small">{error}</span>}
    </span>
  );
}
