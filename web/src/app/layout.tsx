import type { Metadata } from "next";
import { cookies } from "next/headers";
import { DEFAULT_LANG, isLang } from "@/lib/i18n-core";
import { LangProvider } from "@/lib/i18n";
import "./globals.css";

export const metadata: Metadata = {
  title: "PRITOK — bond registry and payouts",
  description: "Holder registry and corporate-action payouts for tokenized bonds on Solana",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const saved = (await cookies()).get("lang")?.value;
  const lang = isLang(saved) ? saved : DEFAULT_LANG;
  return (
    <html lang={lang}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <LangProvider initial={lang}>{children}</LangProvider>
      </body>
    </html>
  );
}
