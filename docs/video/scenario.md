# Демо-видео PRITOK: сценарий (≤ 3:00)

Для Superteam Kazakhstan × KASE side track *Corporate Actions on Blockchain*. Подача до 2026-10-13 06:59 UTC.

**Требования трека к видео** (страница трека, проверено 2026-10-12): длительность, язык и обязательные кадры не заданы. Сказано только «Demo video» в составе подачи. Ограничение 3:00 и английский язык — наш выбор.

**Обязательно показать по треку:** три сценария — купон, погашение, ещё одно корпоративное действие. Каждый по цепочке «держатели на дату → расчёт прав → исполнение → запись onchain». Плюс минимальные требования: тестовый инструмент, реестр, механизм даты фиксации, расчёт, проверяемая onchain-запись, разделение «реализовано / симулировано».

**Язык.** Озвучка и подписи на английском. Интерфейс по умолчанию тоже английский, записываем с `?lang=en`. Переключатель KZ · EN · RU показываем один раз, на 1–2 секунды.

**Роли.** В приложении роль регистратора называется *Operator* (platform operator: registrar and paying agent). На плашках пишем «Operator (registrar)».

**Не говорить:** что проект аффилирован с KASE (это независимый прототип); что стейблкоин, KYC или банковский перевод настоящие.

| Время | Роль / экран | Что в кадре | Что говорим (EN) | Пункт требований |
|---|---|---|---|---|
| 0:00–0:12 | Титульный слайд | PriTok; «Registrar and paying agent for tokenized bonds on Solana»; три пункта: one Anchor program · Token-2022, accounts always frozen · record dates onchain, no offchain snapshots. Внизу pritok-sol.vercel.app | V1 | Что построено, Solana-компоненты |
| 0:12–0:30 | Эмитент → Публичный реестр | Форма «New bond issue» (100 000 ₸, 16%, 2 yr · 4 coupons, 1000) → Create issue → реестр 300 / 200 / 500, таймлайн выпуска, адресная строка vercel.app | V2 | Тестовый токенизированный инструмент, реестр держателей |
| 0:30–0:42 | Solana Explorer | Страница минта облигации: Token-2022, Extensions — Default Account State: Frozen, Permanent Delegate = bond PDA | V3 | Solana-компоненты, контроль реестра программой |
| 0:42–1:04 | Инвестор → Публичный реестр | Айгерим переводит 10 Болату до даты фиксации; после фиксации Болат переводит 10 фонду. «Holder register as of: Coupon 1» → 290 / 210 / 500; вкладка «Now» → 290 / 200 / 510 | V4 | **Купон:** держатели на дату фиксации, механизм даты фиксации |
| 1:04–1:28 | Оператор → Explorer | Панель расчёта купона 1 (units × 8 000 ₸); эмитент вносит 8 000 000 ₸; консоль оператора → Execute payout → «3 of 3» → Report с квитанциями → Explorer: Program Logs `PayHolder` | V5 | **Купон:** расчёт прав, исполнение onchain, проверяемая запись |
| 1:28–1:48 | Эмитент → Оператор → Explorer | Early partial redemption 20% на дату купона 2 → «Announce and fund» (20 000 000 ₸) → после даты Execute payout по «Amortization 20%» → номинал 80 000 ₸ в карточке → Program Logs | V6 | **Доп. действие:** частичное досрочное погашение |
| 1:48–2:12 | Эмитент → Оператор → Публичный реестр | Купон 3: «Fund 75%» → после даты выплаты Record default → «Issuer debt» красным в карточке и в списке выпусков → эмитент вносит остаток → Execute payout. Короткая вставка: Болат «To bank» по купону 2, оператор «Confirm» со ссылкой на платёж | V7 | Плюс: дефолт и его погашение; поток расчётов через банк (симулирован) |
| 2:12–2:32 | Оператор → Explorer | Дата фиксации погашения: переводы закрыты. Execute redemption → Outstanding 0, «1 000 redeemed and burned» → Program Logs: `RedeemFor`, `Burn` (Token-2022) | V8 | **Погашение:** держатели, номинал, расчёт, сжигание токенов |
| 2:32–2:48 | Публичный реестр → Портфель | Реестр на дату (вкладки Coupon 1…Maturity), журнал операций со ссылками на транзакции; портфель Болата: received, calendar, history | V9 | Проверяемая запись, продукт и UX |
| 2:48–3:00 | Итоговый слайд | Две колонки из README: Implemented onchain / Simulated; строка «Next: one pilot bond issue»; ссылки на демо и GitHub | V10 | Разделение «реализовано / симулировано» |

## Сверх задания, если останется время

- **Сделка DvP с НКД** (Investor → «Sell: delivery versus payment»): 5–8 секунд вместо части V9. Фраза: «Secondary trades settle delivery versus payment; the program adds accrued interest.»
- **Переключение KZ · EN · RU**: 1–2 секунды без слов, в V9.

## Слайды (сделать до монтажа)

1. **Титульный** (0:00): логотип PriTok из `docs/assets/pritok-logo-polished.png`, подзаголовок и три пункта из таблицы.
2. **Итоговый** (2:48). Слева — **Implemented onchain**: bond token & holder registry · record dates & entitlements · coupons, partial redemption, maturity with burn · default, public debt & cure · bank payout up to the paying agent · DvP with accrued interest. Справа — **Simulated**: KYC · tKZT instead of a tenge stablecoin · bank transfer itself · accelerated time · demo signing. Внизу: «Independent prototype · Solana devnet · github.com/ssadkov/pritok».
