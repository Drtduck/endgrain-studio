import type { Page } from '@playwright/test'

/**
 * Предустановка cookie согласия для существующих e2e-спеков. Баннер согласия
 * теперь монтируется в корневом layout и покрывает все домены и страницы;
 * без решения он рисуется поверх нижней части экрана и способен перекрыть
 * элементы, с которыми уже работают старые тесты. Значение denied валидно
 * всегда, независимо от региона (см. lib/consent/cookie.ts, isDecisionValidFor),
 * поэтому баннер гарантированно не рисуется вне зависимости от заголовка страны.
 *
 * Специфичные сценарии самого согласия (e2e/consent.spec.ts) cookie не
 * предустанавливают - они как раз проверяют поведение без решения.
 */
export const CONSENT_COOKIE_NAME = 'eg-consent'
export const CONSENT_COOKIE_VALUE = '1.0.opt-in.banner.1755043200'

/** Тот же адрес, что и baseURL в playwright.config.ts: cookie host-only на 127.0.0.1. */
const E2E_ORIGIN = 'http://127.0.0.1:3100'

export async function presetConsent(page: Page): Promise<void> {
  await page.context().addCookies([{ name: CONSENT_COOKIE_NAME, value: CONSENT_COOKIE_VALUE, url: E2E_ORIGIN }])
}
