import { expect, test, type Page } from '@playwright/test'
import { presetConsent } from './helpers/consent'

test.beforeEach(async ({ page }) => {
  await presetConsent(page)
})

/**
 * Группа «без ключей» выполняется всегда, в том числе в CI, и это самый ценный
 * тест задачи: ровно в таком виде проект поедет на конкурс. Если какой-то из
 * сценариев ниже требует секретов, он написан неправильно.
 */
async function openStudio(page: Page): Promise<void> {
  await page.addInitScript(() => window.localStorage.clear())
  await page.goto('/')
  await expect(page.getByTestId('board-canvas')).toBeVisible()
}

test.describe('оплата без ключей', () => {
  test('страница тарифов открывается с обеими карточками', async ({ page }) => {
    await page.goto('/pricing')
    await expect(page.getByTestId('pricing-plans')).toBeVisible()
    await expect(page.getByTestId('pricing-free')).toBeVisible()
    await expect(page.getByTestId('pricing-pro')).toBeVisible()
  })

  test('вместо кнопок оплаты стоит честная строка', async ({ page }) => {
    await page.goto('/pricing')
    await expect(page.getByTestId('pricing-disabled')).toBeVisible()
    await expect(page.getByTestId('pricing-buy-monthly')).toHaveCount(0)
    await expect(page.getByTestId('pricing-buy-yearly')).toHaveCount(0)
  })

  test('в шапке студии нет кнопки «Улучшить»', async ({ page }) => {
    await openStudio(page)
    await expect(page.getByTestId('app-header')).toBeVisible()
    await expect(page.getByTestId('upgrade-button')).toHaveCount(0)
    await expect(page.getByTestId('pro-badge')).toHaveCount(0)
  })

  test('на лендинге есть секция тарифов', async ({ page }) => {
    await page.goto('/landing')
    await expect(page.getByTestId('landing-pricing')).toBeVisible()
    await expect(page.getByTestId('landing-footer-pricing')).toHaveCount(1)
  })

  test('обычный PNG качается, PNG для печати под замком', async ({ page }) => {
    await openStudio(page)

    // Анонимный человек без подписки: базовый экспорт открыт, кнопка работает.
    const [file] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('export-png').click(),
    ])
    expect(file.suggestedFilename()).toMatch(/\.png$/)
    expect(await file.path()).not.toBeNull()

    // PNG для печати показан с замком и ведёт на тарифы, а не прячется.
    // Именно такое поведение задумано с тех пор, как Pro закрыл тяжёлый экспорт.
    const hd = page.getByTestId('export-png-hd')
    await expect(hd).toBeVisible()
    await expect(hd).toHaveAttribute('href', '/pricing')
  })

  test('отмена оплаты показывает баннер на странице тарифов', async ({ page }) => {
    // cancel_url ведёт именно сюда: отсюда можно сразу попробовать ещё раз.
    await page.goto('/pricing?checkout=cancel')
    await expect(page.getByTestId('checkout-banner')).toBeVisible()
    await expect(page.getByTestId('pricing-plans')).toBeVisible()
  })

  test('возврат из кассы показывает баннер, крестик его закрывает', async ({ page }) => {
    await page.addInitScript(() => window.localStorage.clear())
    await page.goto('/?checkout=success')
    const banner = page.getByTestId('checkout-banner')
    await expect(banner).toBeVisible()
    await page.getByTestId('checkout-banner-close').click()
    await expect(banner).toHaveCount(0)
  })
})

// Группа с живыми ключами пропускается по образцу e2e/auth.spec.ts.
const enabled = process.env['E2E_STRIPE'] === '1'

test.describe('оплата с живыми ключами', () => {
  test.skip(!enabled, 'Требует тестовых ключей Stripe: запускать локально с E2E_STRIPE=1')

  test('клик по месячному тарифу уводит на hosted checkout', async ({ page }) => {
    await page.goto('/login')
    await page.getByTestId('auth-email').fill(process.env['E2E_AUTH_EMAIL'] ?? '')
    await page.getByTestId('auth-password').fill(process.env['E2E_AUTH_PASSWORD'] ?? '')
    await page.getByTestId('auth-submit').click()
    await expect(page.getByTestId('tab-projects')).toBeVisible({ timeout: 15_000 })

    await page.goto('/pricing')
    await page.getByTestId('pricing-buy-monthly').click()
    // dataLayer ловит checkout_started ещё до редиректа: событие пушится в buy()
    // синхронно, редирект на hosted checkout идёт следом асинхронно.
    await expect
      .poll(() =>
        page.evaluate(() =>
          (window.dataLayer ?? []).some(
            (e: unknown) => (e as { event?: string; plan?: string }).event === 'checkout_started' && (e as { plan?: string }).plan === 'monthly'
          )
        )
      )
      .toBe(true)
    // Форму Stripe не заполняем: это был бы тест чужой вёрстки. Проверяем ровно то,
    // за что отвечаем сами: сессия создалась и нас на неё увели.
    await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30_000 })
  })
})
