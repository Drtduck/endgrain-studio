# Ресерч: fal.ai как дешёвый fallback генераций (техдолг п.3, часть п.5)

Дата: 13 августа 2026.

## 1. Text-to-image: самые дешёвые модели

| Модель | Endpoint | Цена | Примечание |
|---|---|---|---|
| FLUX.1 [schnell] | `fal-ai/flux/schnell` | $0.003/мегапиксель | Самая дешёвая, ~$0.003 за 1024x1024. Выбор для бесплатного тира |
| Qwen-Image | `fal-ai/qwen-image` | $0.02/MP (~50 img/$1) | |
| SDXL Lightning | `fal-ai/fast-lightning-sdxl` | по compute-секундам GPU | цена непрозрачна, schnell выгоднее |
| Seedream V4 | `fal-ai/bytedance/seedream/v4/text-to-image` | $0.03/img | качественнее, дороже |
| Nanobanana | `fal-ai/nano-banana` | $0.0398/img | |

## 2. Image-to-image (узор по фото доски)

| Модель | Endpoint | Цена |
|---|---|---|
| FLUX.1 Kontext [dev] LoRA | `fal-ai/flux-kontext-lora` | $0.035/MP |
| FLUX.1 Kontext [pro] | `fal-ai/flux-pro/kontext` | $0.04/img (рекомендация для точных правок) |
| FLUX.1 Kontext [max] multi | `fal-ai/flux-pro/kontext/max/multi` | $0.08/img (несколько референсов) |

## 3. Видео 5 секунд

| Модель | Endpoint | Цена за 5 сек |
|---|---|---|
| Ovi | `fal-ai/ovi/image-to-video` | $0.20 (фикс за видео) |
| Wan 2.5 | `fal-ai/wan-25-preview/text-to-video` | $0.25 ($0.05/сек) |
| Kling 2.5 Turbo Pro | `fal-ai/kling-video/v2.5-turbo/pro/image-to-video` | $0.35 |
| Veo 3 | `fal-ai/veo3/image-to-video` | $2.00 (топ) |

Экономика видео-кошелька: продаём $2 за 5-секундную генерацию, себестоимость $0.20-0.35, маржа ~85%.

## 4. API-интеграция

- Пакет `@fal-ai/client` (официальный, заменил `@fal-ai/serverless-client`).
- Аутентификация: env `FAL_KEY` на сервере, клиент подхватывает автоматически.
- Ключ только на сервере. Для клиентских вызовов - `@fal-ai/server-proxy`:
  `app/api/fal/proxy/route.ts` -> `createRouteHandler()` из `@fal-ai/server-proxy/nextjs`.
- `fal.subscribe(endpoint, {input})` - синхронно с поллингом очереди; `fal.queue.submit()` с `webhookUrl` - для долгих генераций (видео).
- Биллинг только за успешные результаты.

## 5. Получение ключа (для Станислава)

1. Регистрация на https://fal.ai (email или соцсеть).
2. https://fal.ai/dashboard/keys -> сгенерировать ключ (показывается один раз, сразу скопировать).
3. https://fal.ai/dashboard/usage-billing -> привязать карту или разовое пополнение (prepaid, подписки нет). $5-10 хватит на тысячи schnell-генераций.
4. Новым пользователям иногда дают промо-кредиты - проверить в дашборде.
5. Ключ добавить в Vercel: Settings -> Environment Variables -> `FAL_KEY` (Production + Preview).

## Продуктовая логика (из техдолга)

Бесплатному пользователю: 3 пробные генерации на flux/schnell. Дальше пейвол Pro (генерация на Gemini/качественной модели). Счётчик попыток привязывать не только к браузеру (localStorage обнуляется в инкогнито): для гостя - комбинация cookie + IP-hash в БД, для залогиненного - user_id.
