import { expect, test, type Page } from '@playwright/test'

// Демо-режим (ни одного ключа AI): такой прогон работает в любом окружении, в том числе
// в CI без единого секрета, тот же приём, что в e2e/promo-studio.spec.ts.
const noAiKeys = (process.env['GEMINI_API_KEY'] ?? '') === '' && (process.env['FAL_KEY'] ?? '') === ''

// Живой прогон бесплатного тира требует настоящих FAL_KEY, FREE_TRIAL_SECRET и живого
// Supabase (service-роль для consume_free_trial): без них счётчик пробных попыток не
// из чего считать. Живой вызов fal в этом прогоне сознательно не проверяется отдельно -
// он покрыт lib/ai/providers/fal.test.ts на моке; здесь важно поведение гейта и пейвола.
// Запуск: E2E_TRIAL=1 FAL_KEY=... FREE_TRIAL_SECRET=... NEXT_PUBLIC_SUPABASE_URL=... ... pnpm test:e2e -- trial.spec.ts
const trialEnabled = process.env['E2E_TRIAL'] === '1'

async function openStudio(page: Page): Promise<void> {
  await page.addInitScript(() => window.localStorage.clear())
  await page.goto('/?tab=editor')
  await expect(page.getByTestId('board-canvas')).toBeVisible()
  await page.getByTestId('tab-promo').click()
}

test.describe('бесплатный тир: демо-режим без ключей', () => {
  test.skip(!noAiKeys, 'в окружении есть ключ AI: демо-режим недоступен, это другой сценарий')

  test('без ключей пейвола и счётчика пробных нет вовсе, вкладка работает на заглушках', async ({ page }) => {
    await openStudio(page)
    await expect(page.getByTestId('promo-panel')).toBeVisible()
    // В демо-режиме гейта нет вообще: ни строки-замка, ни пейвола, ни счётчика пробных.
    await expect(page.getByTestId('promo-gate')).toHaveCount(0)
    await expect(page.getByTestId('promo-trial-note')).toHaveCount(0)
    await expect(page.getByTestId('promo-paywall')).toHaveCount(0)
    await expect(page.getByTestId('promo-generate')).toBeEnabled()

    await page.getByTestId('promo-generate').click()
    // Демо-режим отвечает мок-режимом: ошибки нет, галерея на месте.
    await expect(page.getByTestId('promo-error')).toHaveCount(0)
    await expect(page.getByTestId('promo-shot-hero')).toBeVisible()
  })

  test('без ключей все чипы пресетов доступны разом: cap в один кадр это только про пробный тир', async ({ page }) => {
    await openStudio(page)
    await page.getByTestId('promo-preset-catalog').click()
    await page.getByTestId('promo-preset-workbench').click()
    await expect(page.getByTestId('promo-shot-catalog')).toBeVisible()
    await expect(page.getByTestId('promo-shot-workbench')).toBeVisible()
    await expect(page.getByTestId('promo-preset-hero')).toBeEnabled()
  })
})

test.describe('бесплатный тир: живой гейт', () => {
  test.skip(!trialEnabled, 'Требует FAL_KEY, FREE_TRIAL_SECRET и живого Supabase: запускать с E2E_TRIAL=1')

  test('гость жмёт генерацию три раза, счётчик считает вниз, четвёртая попытка запирает панель', async ({ page }) => {
    await openStudio(page)
    await expect(page.getByTestId('promo-trial-note')).toContainText('3')

    for (const expected of ['2', '1', '0']) {
      await page.getByTestId('promo-generate').click()
      await expect(page.getByTestId('promo-photo')).not.toContainText('Рисуем серию', { timeout: 30_000 })
      await expect(
        page.getByTestId('promo-trial-note').or(page.getByTestId('promo-paywall')),
      ).toContainText(expected === '0' ? 'Пробные генерации закончились' : expected)
    }

    await expect(page.getByTestId('promo-paywall')).toBeVisible()
    await expect(page.getByTestId('promo-paywall-pricing')).toHaveAttribute('href', '/pricing')
    await expect(page.getByTestId('promo-paywall-signin')).toBeVisible()
  })

  test('очистка cookie после исчерпания не возвращает попытки: лимит держит и IP', async ({ page, context }) => {
    await openStudio(page)
    for (let i = 0; i < 3; i += 1) {
      await page.getByTestId('promo-generate').click()
      await expect(page.getByTestId('promo-photo')).not.toContainText('Рисуем серию', { timeout: 30_000 })
    }
    await expect(page.getByTestId('promo-paywall')).toBeVisible()

    await context.clearCookies()
    await page.reload()
    await page.getByTestId('tab-promo').click()
    // Тот же адрес: пейвол на месте, несмотря на новую cookie гостя.
    await expect(page.getByTestId('promo-paywall')).toBeVisible()
  })

  test('уже сгенерированные кадры остаются на экране после появления пейвола', async ({ page }) => {
    await openStudio(page)
    for (let i = 0; i < 3; i += 1) {
      await page.getByTestId('promo-generate').click()
      await expect(page.getByTestId('promo-photo')).not.toContainText('Рисуем серию', { timeout: 30_000 })
    }
    await expect(page.getByTestId('promo-paywall')).toBeVisible()
    await expect(page.getByTestId('promo-gallery')).toBeVisible()
  })
})

// Обещание «кадры переживают перезагрузку» (P0-6, ревью 14.08.2026): без входа
// generatePromoSeriesAction сам никуда не пишет (ensureSaved требует user),
// поэтому персистентность честно проверяется только под вошедшим пользователем -
// ровно тем путём, для которого написана хидратация listPromoSeriesAction/
// listActiveSeriesAction в PhotoSeries.tsx.
// Запуск: E2E_AUTH=1 E2E_TRIAL=1 E2E_AUTH_EMAIL=... E2E_AUTH_PASSWORD=... FAL_KEY=... FREE_TRIAL_SECRET=... NEXT_PUBLIC_SUPABASE_URL=... ... pnpm test:e2e -- trial.spec.ts
const authEnabled = process.env['E2E_AUTH'] === '1'

test.describe('бесплатный тир: кадры переживают перезагрузку (живой Supabase, вошедший пользователь)', () => {
  test.skip(!trialEnabled || !authEnabled, 'Требует E2E_AUTH=1 и E2E_TRIAL=1: вход и реальное списание пробного тира')

  test('сгенерировал кадр, перезагрузил страницу - кадр на месте', async ({ page }) => {
    await page.addInitScript(() => window.localStorage.clear())
    await page.goto('/login')
    await page.getByTestId('auth-email').fill(process.env['E2E_AUTH_EMAIL'] ?? '')
    await page.getByTestId('auth-password').fill(process.env['E2E_AUTH_PASSWORD'] ?? '')
    await page.getByTestId('auth-submit').click()
    await expect(page.getByTestId('tab-projects')).toBeVisible({ timeout: 15_000 })

    await page.goto('/?tab=editor')
    await expect(page.getByTestId('board-canvas')).toBeVisible()
    await page.getByTestId('tab-promo').click()

    await page.getByTestId('promo-generate').click()
    await expect(page.getByTestId('promo-photo')).not.toContainText('Рисуем серию', { timeout: 30_000 })
    await expect(page.getByTestId('promo-shot-done').first()).toBeVisible({ timeout: 30_000 })

    await page.reload()
    await page.getByTestId('tab-promo').click()
    // Кадр подхватился заново из базы (hydrate в PhotoSeries.tsx), а не пропал
    // с глаз только потому, что клиентское состояние runner'а после F5 пустое.
    await expect(page.getByTestId('promo-shot-done').first()).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('promo-gallery')).toBeVisible()
  })
})
