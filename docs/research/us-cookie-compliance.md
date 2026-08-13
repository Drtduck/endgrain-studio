# Ресерч: US cookie/privacy compliance (техдолг п.1)

Дата: 13 августа 2026.

## 1. Пороги применимости законов штатов

- **Калифорния (CCPA/CPRA):** выручка > $26.6 млн (порог индексируется), или 100 000+ калифорнийских потребителей, или 50%+ выручки от продажи данных.
- **Вирджиния (CDPA), Колорадо (CPA):** 100 000+ потребителей, либо 25 000+ при доходе от продажи данных.
- **Коннектикут (CTDPA):** с 1 июля 2026 порог снижен до 35 000, плюс триггеры без порога: продажа ПДн или обработка чувствительных данных в любом объёме.
- **Юта (UCPA):** двойное условие ($25 млн выручки И объём).

Вывод: микро-SaaS ниже всех порогов - формально ни один закон не применяется. Осторожность: рекламные пиксели могут трактоваться как «sharing» даже без денег.

## 2. Opt-out модель и GPC

- Ссылка «Do Not Sell or Share My Personal Information» обязательна ТОЛЬКО при продаже/шеринге данных. Если не продаём - явно написать это в privacy policy.
- **Global Privacy Control:** с 1 января 2026 двенадцать штатов требуют распознавания opt-out сигналов; сайт должен визуально показывать, что сигнал обработан. Прецедент: Sephora, штраф $1.2 млн за игнорирование GPC. Технически: `navigator.globalPrivacyControl` (boolean) -> автоматический opt-out.
- Privacy policy минимум: категории данных, цели, третьи лица, права потребителя (access/delete/correct/opt-out), контакт, факт непродажи данных.

## 3. Google Consent Mode v2 (для GA4)

Параметры: `ad_storage`, `analytics_storage`, `ad_user_data`, `ad_personalization`.

```javascript
gtag('consent', 'default', { ...все denied..., 'region': ['AT','BE', /* EU */] });
gtag('consent', 'default', { 'analytics_storage': 'granted', ... }); // fallback для остальных (US opt-out)
gtag('consent', 'update', { 'analytics_storage': 'granted' }); // после выбора
```

Регионы по ISO 3166-2 (для США можно коды штатов). EU: opt-in (default denied). US: opt-out (default granted + способ отказаться). С июня 2026 Google делает `ad_storage` единственным гейтом рекламных данных GA4 - перепроверить при реализации.

## 4. Практический минимум для Endgrain Studio

1. Страница Privacy Policy: cookies (auth, analytics), «мы не продаём данные».
2. Non-blocking cookie-баннер (уведомление + ссылка), строгий opt-in только для EU/RU-регионов.
3. GA4 через Consent Mode v2: default granted для US, denied для EU до согласия.
4. Слушатель `navigator.globalPrivacyControl` сразу (дёшево сейчас, дорого потом) + видимое подтверждение обработки сигнала.

Готовые open-source: c15t, react-cookie-consent, consent-nextjs. Для нашего стека проще своя лёгкая реализация + Consent Mode.

## Источники

- https://www.clym.io/blog/ccpa-applicability-guide
- https://www.enzuzo.com/blog/us-state-privacy-laws
- https://www.osano.com/us-data-privacy-laws
- https://www.clym.io/blog/ccpa-not-sell-or-share-requirement
- https://termly.io/resources/articles/do-not-sell-my-personal-information/
- https://www.didomi.io/blog/global-privacy-control-gpc-2026
- https://developers.google.com/tag-platform/security/guides/consent
- https://www.simoahava.com/analytics/consent-mode-v2-google-tags/
- https://secureprivacy.ai/blog/google-consent-mode-june-2026-ad-storage-is-now-the-only-gate-on-ga4-ads-data
- https://posthog.com/tutorials/nextjs-cookie-banner
- https://github.com/rabelais88/consent-nextjs
