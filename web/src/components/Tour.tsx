"use client";

import { useEffect } from "react";
import "driver.js/dist/driver.css";

const SEEN_KEY = "pritok-tour-v1";

// The tour tells the bond's story in order; each step points at a data-tour element.
const STEPS: { el: string; title: string; text: string }[] = [
  {
    el: "next-step",
    title: "Что происходит сейчас",
    text: "Эта строка читает состояние выпуска и подсказывает следующий шаг. Время в демо ускорено: полгода проходят за минуты.",
  },
  {
    el: "bond",
    title: "Выпуск облигаций",
    text: "Компания заняла деньги у инвесторов: 1 000 облигаций по 100 000 ₸ под 16% годовых. Справа — номинал, сколько в обращении, сколько выплачено и есть ли долг.",
  },
  {
    el: "timeline",
    title: "Жизнь облигации",
    text: "Весь график сразу: купоны два раза в год, амортизация, погашение. Зелёное — выплачено, красное — долг эмитента.",
  },
  {
    el: "events",
    title: "Корпоративные действия",
    text: "Каждое событие: дата фиксации реестра, дата выплаты, сумма на облигацию и сколько эмитент уже внёс. Нажмите на строку — справа появится расчёт.",
  },
  {
    el: "calc",
    title: "Расчёт по каждому держателю",
    text: "Облигаций на дату фиксации × сумма на облигацию. У каждой выплаты — ссылка на квитанцию в блокчейне: проверить может любой.",
  },
  {
    el: "registry",
    title: "Реестр на дату фиксации",
    text: "Кто владел облигациями в момент фиксации — тот и получает выплату. Перевод после фиксации выплату уже не передаёт.",
  },
  {
    el: "roles",
    title: "Роли",
    text: "Переключайтесь: эмитент вносит деньги и объявляет амортизацию, инвестор получает выплаты и переводит облигации, регистратор допускает инвесторов и подтверждает банковские выплаты.",
  },
  {
    el: "journal",
    title: "Журнал операций",
    text: "Каждая строка — транзакция в Solana devnet. Никаких сверок: история выпуска и есть реестр.",
  },
  {
    el: "bonds",
    title: "Все выпуски",
    text: "Платформа ведёт сколько угодно выпусков. Кнопка «Новый демо-выпуск» создаст свежий — он пройдёт весь цикл примерно за 17 минут.",
  },
];

export async function startTour() {
  const { driver } = await import("driver.js");
  const steps = STEPS.filter((s) => document.querySelector(`[data-tour="${s.el}"]`)).map((s) => ({
    element: `[data-tour="${s.el}"]`,
    popover: { title: s.title, description: s.text },
  }));
  driver({
    steps,
    showProgress: true,
    progressText: "{{current}} из {{total}}",
    nextBtnText: "Далее →",
    prevBtnText: "← Назад",
    doneBtnText: "Понятно",
    popoverClass: "pritok-tour",
    smoothScroll: true,
    onDestroyed: () => {
      try {
        localStorage.setItem(SEEN_KEY, "1");
      } catch {}
    },
  }).drive();
}

/** Starts the tour once per browser, after the bond has rendered. */
export function useFirstVisitTour(ready: boolean) {
  useEffect(() => {
    if (!ready) return;
    let seen = true;
    try {
      seen = localStorage.getItem(SEEN_KEY) === "1";
    } catch {}
    if (seen || new URLSearchParams(window.location.search).has("as")) return;
    const t = setTimeout(startTour, 800);
    return () => clearTimeout(t);
  }, [ready]);
}

/** Small "?" with a plain-language explanation of a term. */
export function Term({ tip }: { tip: string }) {
  return (
    <span className="term" tabIndex={0} data-tip={tip} aria-label={tip}>
      ?
    </span>
  );
}
