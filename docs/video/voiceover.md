# Демо-видео PRITOK: текст озвучки (EN)

Читать под черновик `pritok-demo-draft.mp4` с выключенным звуком: субтитры в кадре совпадают с текстом и показывают, где ты должен быть.

**Как записать:** весь текст одним аудиофайлом. Между блоками пауза 2–3 секунды. Сбился — пауза, и прочитай блок заново целиком: лишний дубль я выброшу. Темп спокойный, около 130 слов в минуту. Каждый блок короче своего окна на 1–2 секунды, торопиться не нужно.

| Блок | Окно | Слов |
|---|---|---|
| V1 | 0:00–0:05 | 7 |
| V2 | 0:05–0:25 | 39 |
| V3 | 0:25–0:38 | 25 |
| V4 | 0:38–1:02 | 51 |
| V5 | 1:02–1:26 | 48 |
| V6 | 1:26–1:46 | 39 |
| V7 | 1:46–2:12 | 49 |
| V8 | 2:12–2:32 | 39 |
| V9 | 2:32–2:44 | 22 |
| V10 | 2:44–2:56 | 23 |

**V1 · 0:00–0:05 · Title**
PriTok: bond registry and payouts on Solana.

**V2 · 0:05–0:25 · Issuer**
The issuer creates a test bond: one hundred thousand tenge face value, sixteen percent, semi-annual coupons, two years. It is placed among three admitted investors — thirty, twenty and fifty percent. Time is accelerated: a half-year is four minutes.

**V3 · 0:25–0:38 · Explorer**
In the explorer: a Token-2022 mint, accounts frozen by default, the bond as permanent delegate. Every movement goes through one program — no offchain snapshots.

**V4 · 0:38–1:02 · Record date**
Coupon one. Aigerim sends ten bonds to Bolat before the record date. After it, she sends ten more to the fund. The register as of the record date still shows Aigerim two hundred ninety, the fund five hundred, Bolat two hundred ten: the coupon follows the bond held on that date.

**V5 · 1:02–1:26 · Coupon payout**
The entitlement is bonds on the record date times the coupon per bond — eight thousand tenge. The issuer funds the payout vault. The operator presses Execute payout, and all three holders are paid in one transaction. Each payment creates a receipt account. Here are the program logs.

**V6 · 1:26–1:46 · Partial redemption**
Our additional action: early partial redemption. The issuer announces twenty percent on coupon two and funds it upfront. Holders get twenty thousand tenge per bond, the face value drops to eighty thousand, and later coupons use the new face.

**V7 · 1:46–2:12 · Default and bank**
If the issuer funds only seventy-five percent, the event is marked defaulted after the payment date. Nobody is paid and the debt is public until the issuer pays the rest. A holder can also take a payout to a bank; the paying agent confirms it with a payment reference.

**V8 · 2:12–2:32 · Maturity**
Maturity. Transfers close on the maturity record date. The operator executes the redemption: each holder gets the principal and the last coupon, and the program burns the bonds. Outstanding supply is zero, and the burn is in the logs.

**V9 · 2:32–2:44 · Registry and portfolio**
Anyone can check the register at any date and open every transaction. Investors see what they received, what is due, and when.

**V10 · 2:44–2:56 · Implemented vs simulated**
Onchain: registry, record dates, payouts, default and burn. Simulated: KYC, the stablecoin and the bank transfer. Next: a pilot on one bond issue.
