// Language core shared by server and client: types, lookup and Russian plurals.
// Russian source strings are the keys (gettext style), so a server error or a lib
// helper that returns Russian text is translated where it is shown.
import { DICT } from "./i18n-dict";

export type Lang = "kk" | "en" | "ru";
export type Vars = Record<string, string | number>;
export type T = (ru: string, vars?: Vars) => string;

/** Switcher order is fixed: KZ · EN · RU. */
export const LANGS: [Lang, string][] = [
  ["kk", "KZ"],
  ["en", "EN"],
  ["ru", "RU"],
];
export const DEFAULT_LANG: Lang = "en";
export const isLang = (x: unknown): x is Lang => x === "kk" || x === "en" || x === "ru";

const missing = new Set<string>();

export function translate(lang: Lang, ru: string, vars?: Vars) {
  let s = ru;
  if (lang !== "ru") {
    const row = DICT[ru];
    if (row) s = row[lang === "en" ? 0 : 1];
    else if (process.env.NODE_ENV !== "production" && !missing.has(ru)) {
      missing.add(ru);
      console.warn(`[i18n] no translation: ${ru}`);
    }
  }
  return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s;
}

/** Russian pass-through, the default for lib helpers called without a translator. */
export const ruT: T = (s, v) => translate("ru", s, v);

/** Russian plural form key: one / few / many, chosen by the number. */
export function ruPlural(n: number, one: string, few: string, many: string) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b === 1) return one;
  if (b >= 2 && b <= 4) return few;
  return many;
}
