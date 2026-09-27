// "What can be done now": reads the bond state and suggests the next meaningful action,
// so a visitor always knows what the issue is waiting for.
import { CLAIM, KIND, STATUS, eventTitle, money, uiStatus, type BondView } from "./view";

export type StepRole = "issuer" | "operator" | "investor";

export interface NextStep {
  tone: "info" | "action" | "alert" | "done";
  text: string;
  /** Optional countdown target (chain unix seconds) shown after the text. */
  until?: number;
  go?: { role: StepRole; who?: "aigerim" | "bolat" | "fund"; label: string };
}

const WHO = ["aigerim", "bolat", "fund"] as const;

function investorKey(bond: BondView, owner: string) {
  return bond.demo?.investors?.find((i) => i.address === owner)?.key ?? WHO[0];
}

export function nextStep(bond: BondView, now: number): NextStep {
  const title = (e: (typeof bond.events)[number]) => `«${eventTitle(bond, e)}»`;

  if (bond.supply === 0 && bond.subscriptionClosed) {
    return { tone: "done", text: "Выпуск погашен: все облигации сданы, все выплаты проведены." };
  }
  if (bond.paused) {
    return {
      tone: "alert",
      text: "Регистратор приостановил подписку и переводы. Уже возникшие выплаты при этом работают.",
      go: { role: "operator", label: "Кабинет регистратора" },
    };
  }
  if (!bond.subscriptionClosed && now < bond.subscriptionEndTs) {
    return {
      tone: "info",
      text: "Идёт размещение: инвесторы подписываются на облигации, деньги сразу получает эмитент.",
      until: bond.subscriptionEndTs,
      go: { role: "investor", label: "Подписаться как инвестор" },
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
          ? `Срок выплаты ${title(debt)} прошёл, а эмитент внёс ${money(debt.funded)} из ${money(debt.required)} ₸. Любой может зафиксировать технический дефолт — кнопка в расчёте события.`
          : `Технический дефолт по ${title(debt)}: долг ${money(debt.required - debt.funded)} ₸. Выплаты откроются, когда эмитент внесёт всю сумму.`,
      go: { role: "issuer", label: "Погасить долг как эмитент" },
    };
  }

  const bankQueue = bond.claims.filter((c) => c.status === CLAIM.BANK_REQUESTED);
  if (bankQueue.length) {
    return {
      tone: "action",
      text: `${bankQueue.length === 1 ? "Одна выплата ждёт" : `${bankQueue.length} выплаты ждут`} банковского перевода: деньги уже у платёжного агента, осталось подтвердить платёжку.`,
      go: { role: "operator", label: "Подтвердить как платёжный агент" },
    };
  }

  // Money is in the vault and the date has come: holders can take it.
  for (const e of bond.events) {
    if (e.kind === KIND.MATURITY || e.status !== STATUS.FUNDED || now < e.payTs) continue;
    const waiting = bond.holders.find(
      (h) => (h.unitsAt[e.pos] ?? 0) > 0 && !bond.claims.some((c) => c.owner === h.owner && c.actionId === e.actionId),
    );
    if (waiting) {
      return {
        tone: "action",
        text: `Выплату по ${title(e)} можно получить — на кошелёк или через банк.`,
        go: { role: "investor", who: investorKey(bond, waiting.owner), label: "Получить как инвестор" },
      };
    }
  }

  const maturity = bond.events.find((e) => e.kind === KIND.MATURITY);
  if (maturity && now >= maturity.payTs && maturity.status === STATUS.FUNDED && bond.supply > 0) {
    const holder = bond.holders.find((h) => h.balance > 0);
    return {
      tone: "action",
      text: "Срок погашения наступил: держатели сдают облигации (они сжигаются) и получают номинал вместе с последним купоном.",
      go: { role: "investor", who: holder ? investorKey(bond, holder.owner) : undefined, label: "Погасить как инвестор" },
    };
  }

  // Nothing to collect yet: the next payment needs money from the issuer.
  const nextPay = bond.events.find((e) => e.payTs > now);
  if (nextPay && nextPay.funded < nextPay.required) {
    const recorded = nextPay.recordTs <= now;
    return {
      tone: "action",
      text: `${recorded ? "Реестр для" : "Скоро фиксация реестра для"} ${title(nextPay)}${recorded ? " зафиксирован" : ""}. Эмитент ещё не внёс ${money(nextPay.required - nextPay.funded)} ₸ — можно внести всё или 75%, чтобы увидеть дефолт.`,
      until: nextPay.payTs,
      go: { role: "issuer", label: "Внести деньги как эмитент" },
    };
  }

  const nextRecord = bond.events.find((e) => e.recordTs > now);
  if (nextRecord) {
    return {
      tone: "info",
      text: `До фиксации реестра для ${title(nextRecord)}: перевод сейчас передаст выплату получателю, после фиксации — нет.`,
      until: nextRecord.recordTs,
      go: { role: "investor", label: "Перевести как инвестор" },
    };
  }
  if (nextPay) return { tone: "info", text: `Всё профинансировано, ждём даты выплаты ${title(nextPay)}.`, until: nextPay.payTs };
  return { tone: "info", text: "Событий впереди нет." };
}
