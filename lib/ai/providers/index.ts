import 'server-only'
import { isFalConfigured, isGeminiConfigured } from '@/lib/promo/config'
import { falProProvider, falProvider } from './fal'
import { geminiProvider } from './gemini'
import { mockProvider } from './mock'
import type { ImageOutcome, ImageProvider, ImageRequest, ImageTier, ProviderId } from './types'

export type { ImageOutcome, ImageProvider, ImageRequest, ImageTier, ProviderId }

/**
 * withFallback уходит во второй провайдер только на failed. На blocked не
 * уходит: это отказ по содержанию запроса, второй провайдер, скорее всего,
 * нарисует то, что первый счёл неуместным, и мы заплатим дважды за проблему,
 * которую не решали.
 */
export function withFallback(primary: ImageProvider, secondary: ImageProvider): ImageProvider {
  return {
    id: primary.id,
    tier: primary.tier,
    async generate(req: ImageRequest): Promise<ImageOutcome> {
      const outcome = await primary.generate(req)
      if (outcome.kind !== 'failed') return outcome
      // Fallback не бесплатный: частый fallback это сигнал, что с ключом
      // первого провайдера что-то не так, а не фоновый шум.
      console.error(`ai fallback: ${primary.id} -> ${secondary.id}`)
      return secondary.generate(req)
    },
  }
}

/**
 * Таблица выбора провайдера по наличию ключей:
 *
 * | Ключи                 | tier: good (Pro)             | tier: cheap (пробный)   |
 * |-----------------------|------------------------------|-------------------------|
 * | нет ни одного         | mock                         | mock                    |
 * | только GEMINI_API_KEY | gemini                       | free-тир выключен (null)|
 * | только FAL_KEY        | fal nano banana 2            | fal flux/schnell        |
 * | оба                   | fal nano banana 2 с fallback | fal flux/schnell        |
 * |                       | на gemini                    |                         |
 *
 * Pro рисует на fal (nano banana 2), а не на Gemini: у Gemini нет оплаченного
 * баланса, и связка «основной провайдер без денег плюс fallback» означала бы
 * лишний неудачный запрос перед каждым кадром. Gemini остаётся вторым номером
 * ровно на случай, когда fal лёг, и только если ключ заведён.
 *
 * null для tier: cheap без FAL_KEY принципиален: пускать бесплатных на
 * дорогую модель ради красивого продуктового обещания значит платить за
 * трафик из ниоткуда. На практике этот путь не должен вызываться вовсе:
 * isFreeTrialConfigured() гейтит free-тир раньше, чем действие дойдёт сюда.
 */
export function resolveImageProvider(tier: ImageTier): ImageProvider | null {
  const gemini = isGeminiConfigured()
  const falOn = isFalConfigured()

  if (!gemini && !falOn) return mockProvider

  if (tier === 'cheap') return falOn ? falProvider : null

  if (!falOn) return geminiProvider
  return gemini ? withFallback(falProProvider, geminiProvider) : falProProvider
}
