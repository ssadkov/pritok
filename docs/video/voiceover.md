# Демо-видео PRITOK: текст озвучки (EN)

Темп около 140 слов в минуту, всего около 360 слов. Блоки совпадают со строками [scenario.md](scenario.md). Если блок не помещается в своё окно, ускоряем видеоряд, а не речь.

**V1 · 0:00–0:12 · Title**
PRITOK is a registrar and paying agent for tokenized bonds. One Anchor program on Solana, Token-2022 bonds with always-frozen accounts, and record dates kept onchain — no offchain snapshots.

**V2 · 0:12–0:30 · Issuer**
The issuer creates a test bond: one hundred thousand tenge face value, sixteen percent, semi-annual coupons, two years. It is placed among three admitted investors — thirty, twenty and fifty percent. Time is accelerated: a half-year is four minutes.

**V3 · 0:30–0:42 · Explorer**
In the explorer, the bond mint has its accounts frozen by default, and the bond itself is the permanent delegate. Holders cannot move bonds outside the program.

**V4 · 0:42–1:04 · Record date**
Coupon one. Aigerim sends ten bonds to Bolat before the record date. After it, she sends ten more to the fund. The register as of the record date still shows Aigerim two hundred ninety, the fund five hundred, Bolat two hundred ten: the coupon follows the bond held on that date.

**V5 · 1:04–1:28 · Coupon payout**
The entitlement is bonds on the record date times the coupon per bond — eight thousand tenge. The issuer funds the payout vault. The operator presses Execute payout, and all three holders are paid in one transaction. Each payment creates a receipt account. Here are the program logs.

**V6 · 1:28–1:48 · Partial redemption**
Our additional action: early partial redemption. The issuer announces twenty percent on coupon two and funds it upfront. Holders get twenty thousand tenge per bond, the face value drops to eighty thousand, and later coupons use the new face.

**V7 · 1:48–2:12 · Default and bank**
If the issuer funds only seventy-five percent, the event is marked defaulted after the payment date. Nobody is paid and the debt is public until the issuer pays the rest. A holder can also take a payout to a bank; the paying agent confirms it with a payment reference.

**V8 · 2:12–2:32 · Maturity**
Maturity. Transfers close on the maturity record date. The operator executes the redemption: each holder gets the principal and the last coupon, and the program burns the bonds. Outstanding supply is zero, and the burn is in the logs.

**V9 · 2:32–2:48 · Registry and portfolio**
Anyone can check the register at any date and open every transaction. Investors see what they received, what is due, and when.

**V10 · 2:48–3:00 · Implemented vs simulated**
Onchain: registry, record dates, entitlements, payouts, default and burn. Simulated: KYC, the tenge stablecoin, the bank transfer, and accelerated time. Next step: a pilot on one bond issue.
