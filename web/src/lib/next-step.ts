// "What can be done now": reads the bond state and suggests the next meaningful action,
// so a visitor always knows what the issue is waiting for.
import { ruT, type T } from "./i18n-core";
import { CLAIM, KIND, STATUS, eventTitle, money, uiStatus, type BondView } from "./view";

export type StepRole = "issuer" | "operator" | "investor";

export interface NextStep {
  tone: "info" | "action" | "alert" | "done";
  text: string;
  /** Optional countdown target (chain unix seconds) shown after the text. */
  until?: number;
  go?: { role: StepRole; who?: "aigerim" | "bolat" | "fund"; label: string };
}

export function nextStep(bond: BondView, now: number, t: T = ruT): NextStep {
  const title = (e: (typeof bond.events)[number]) => `«${eventTitle(bond, e, t)}»`;

  const unpaid = (e: (typeof bond.events)[number]) =>
    bond.holders.filter((h) => (h.unitsAt[e.pos] ?? 0) > 0 && !bond.claims.some((c) => c.owner === h.owner && c.actionId === e.actionId));
  const leftToPay = bond.events.some((e) => e.kind !== KIND.MATURITY && e.status === STATUS.FUNDED && now >= e.payTs && unpaid(e).length);
  if (bond.supply === 0 && bond.subscriptionClosed && !leftToPay) {
    return { tone: "done", text: t("Выпуск погашен: все облигации сданы, все выплаты проведены.") };
  }
  if (bond.paused) {
    return {
      tone: "alert",
      text: t("Регистратор приостановил подписку и переводы. Уже возникшие выплаты при этом работают."),
      go: { role: "operator", label: t("Консоль оператора") },
    };
  }
  if (!bond.subscriptionClosed && now < bond.subscriptionEndTs) {
    return {
      tone: "info",
      text: t("Идёт размещение: инвесторы подписываются на облигации, деньги сразу получает эмитент."),
      until: bond.subscriptionEndTs,
      go: { role: "investor", label: t("Подписаться как инвестор") },
    };
  }

  // A payout date has passed without enough money: the most important thing to see.
  const debt = bond.events.find((e) => ["default", "overdue"].includes(uiStatus({ ...bond, now }, e)));
  if (debt) {
    const st = uiStatus({ ...bond, now }, debt);
    return {
      tone: "alert",
      text:
        st === "overdue"
          ? t(
              "Срок выплаты {event} прошёл, а эмитент внёс {funded} из {required} ₸. Любой может зафиксировать технический дефолт — кнопка в расчёте события.",
              { event: title(debt), funded: money(debt.funded), required: money(debt.required) },
            )
          : t("Технический дефолт по {event}: долг {debt} ₸. Выплаты откроются, когда эмитент внесёт всю сумму.", {
              event: title(debt),
              debt: money(debt.required - debt.funded),
            }),
      go: { role: "issuer", label: t("Погасить долг как эмитент") },
    };
  }

  const bankQueue = bond.claims.filter((c) => c.status === CLAIM.BANK_REQUESTED);
  if (bankQueue.length) {
    return {
      tone: "action",
      text:
        bankQueue.length === 1
          ? t("Одна выплата ждёт банковского перевода: деньги уже у платёжного агента, осталось подтвердить платёжку.")
          : t("{n} выплаты ждут банковского перевода: деньги уже у платёжного агента, осталось подтвердить платёжку.", {
              n: bankQueue.length,
            }),
      go: { role: "operator", label: t("Подтвердить как оператор") },
    };
  }

  // Money is in the vault and the date has come: the operator executes the payout for everyone.
  for (const e of bond.events) {
    if (e.kind === KIND.MATURITY || e.status !== STATUS.FUNDED || now < e.payTs) continue;
    if (unpaid(e).length) {
      return {
        tone: "action",
        text: t("Выплата по {event} готова к исполнению: оператор проводит её всем держателям одной командой. Держатель может и сам получить её раньше — на кошелёк или через банк.", {
          event: title(e),
        }),
        go: { role: "operator", label: t("Исполнить как оператор") },
      };
    }
  }

  const maturity = bond.events.find((e) => e.kind === KIND.MATURITY);
  if (maturity && now >= maturity.payTs && maturity.status === STATUS.FUNDED && bond.supply > 0) {
    return {
      tone: "action",
      text: t("Срок погашения наступил: оператор одной командой выплачивает держателям номинал вместе с последним купоном, а программа сжигает облигации."),
      go: { role: "operator", label: t("Исполнить погашение как оператор") },
    };
  }

  // Nothing to collect yet: the next payment needs money from the issuer.
  const nextPay = bond.events.find((e) => e.payTs > now);
  if (nextPay && nextPay.funded < nextPay.required) {
    const vars = { event: title(nextPay), left: money(nextPay.required - nextPay.funded) };
    return {
      tone: "action",
      text:
        nextPay.recordTs <= now
          ? t("Реестр для {event} зафиксирован. Эмитент ещё не внёс {left} ₸ — можно внести всё или 75%, чтобы увидеть дефолт.", vars)
          : t("Скоро фиксация реестра для {event}. Эмитент ещё не внёс {left} ₸ — можно внести всё или 75%, чтобы увидеть дефолт.", vars),
      until: nextPay.payTs,
      go: { role: "issuer", label: t("Внести деньги как эмитент") },
    };
  }

  const nextRecord = bond.events.find((e) => e.recordTs > now);
  if (nextRecord) {
    return {
      tone: "info",
      text: t("До фиксации реестра для {event}: перевод сейчас передаст выплату получателю, после фиксации — нет.", {
        event: title(nextRecord),
      }),
      until: nextRecord.recordTs,
      go: { role: "investor", label: t("Перевести как инвестор") },
    };
  }
  if (nextPay) return { tone: "info", text: t("Всё профинансировано, ждём даты выплаты {event}.", { event: title(nextPay) }), until: nextPay.payTs };
  return { tone: "info", text: t("Событий впереди нет.") };
}
