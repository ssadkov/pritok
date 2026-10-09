"use client";

// UI language context, the translator hook and the KZ · EN · RU switcher.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { DEFAULT_LANG, LANGS, isLang, translate, type Lang, type T } from "./i18n-core";

const Ctx = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({ lang: DEFAULT_LANG, setLang: () => {} });

export function LangProvider({ initial, children }: { initial: Lang; children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initial);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    document.cookie = `lang=${l}; path=/; max-age=31536000; samesite=lax`;
    document.documentElement.lang = l;
    // Drop ?lang= so a reload keeps the choice instead of the shared link's language.
    const url = new URL(window.location.href);
    if (url.searchParams.has("lang")) {
      url.searchParams.delete("lang");
      window.history.replaceState(null, "", url.pathname + url.search);
    }
  }, []);
  // ?lang=kk|en|ru in a shared link wins over the cookie.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("lang");
    if (isLang(q) && q !== initial) setLang(q);
  }, [initial, setLang]);
  const value = useMemo(() => ({ lang, setLang }), [lang, setLang]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLang() {
  return useContext(Ctx);
}

/** Translator bound to the current language. */
export function useT(): T {
  const { lang } = useContext(Ctx);
  return useMemo<T>(() => (s, v) => translate(lang, s, v), [lang]);
}

export function LangSwitch() {
  const { lang, setLang } = useLang();
  return (
    <div className="lang" role="group" aria-label="Language">
      {LANGS.map(([l, name], i) => (
        <span key={l}>
          {i > 0 && " · "}
          <button aria-pressed={lang === l} onClick={() => setLang(l)}>
            {name}
          </button>
        </span>
      ))}
    </div>
  );
}
