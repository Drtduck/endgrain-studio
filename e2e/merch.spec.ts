import { expect, test, type Page } from '@playwright/test'
import { presetConsent } from './helpers/consent'

test.beforeEach(async ({ page }) => {
  await presetConsent(page)
})

/**
 * Э6/Э7 спеки merch-orders.md (§13.2). CI поднимает сборку без MERCH_ENABLED
 * и без ключей Stripe/Printful (см. playwright.config.ts): рубильник
 * MERCH_ENABLED читается один раз на старте сервера, поэтому включить его
 * из теста здесь нельзя - группа «с MERCH_ENABLED» ниже требует локального
 * запуска с MERCH_ENABLED=1 (и живыми тестовыми ключами для сценария
 * редиректа на checkout.stripe.com).
 */
async function openStudio(page: Page): Promise<void> {
  await page.addInitScript(() => window.localStorage.clear())
  await page.goto('/?tab=editor')
  await expect(page.getByTestId('board-canvas')).toBeVisible()
  await page.getByTestId('tab-promo').click()
  await expect(page.getByTestId('promo-panel')).toBeVisible()
}

test.describe('мерч без MERCH_ENABLED (по умолчанию в CI)', () => {
  test('кнопок «Купить» нет ни на одном из четырёх товаров', async ({ page }) => {
    await openStudio(page)
    for (const id of ['tshirt', 'mug', 'poster', 'apron']) {
      await expect(page.getByTestId(`merch-item-${id}`)).toBeVisible()
      await expect(page.getByTestId(`merch-buy-button-${id}`)).toHaveCount(0)
    }
  })

  // Регресс на удаление кнопки «Открыть в Printful» (§9.1, §13.2 п.3): покупка
  // идёт через нашу кассу, кабинет Printful покупателю не показываем никогда.
  test('кнопки «Открыть в Printful» нет на странице ни при каком состоянии', async ({ page }) => {
    await openStudio(page)
    await expect(page.getByTestId('merch-printful')).toHaveCount(0)
    await page.getByTestId('merch-generate').click()
    await expect(page.getByTestId('merch-note')).toBeVisible()
    await expect(page.getByTestId('merch-printful')).toHaveCount(0)
  })

  test('«Мои заказы» анониму недоступны: редирект на логин', async ({ page }) => {
    await page.goto('/account/orders')
    await expect(page).toHaveURL(/\/login/)
  })
})

// Группа с включённым рубильником пропускается в CI: MERCH_ENABLED фиксируется
// при старте сборки (`pnpm build && pnpm start`), поэтому проверить кнопку
// «Купить» и путь до Stripe можно только локальным прогоном:
// MERCH_ENABLED=1 PRINTFUL_API_KEY=... STRIPE_SECRET_KEY=sk_test_... E2E_MERCH=1 pnpm e2e merch
const enabled = process.env['E2E_MERCH'] === '1'

test.describe('мерч с MERCH_ENABLED=1 (локально, без живого Stripe)', () => {
  test.skip(!enabled, 'Требует локальной сборки с MERCH_ENABLED=1 и ключами Stripe/Printful')

  test('клик по кружке уводит на hosted checkout Stripe', async ({ page }) => {
    await page.goto('/login')
    await page.getByTestId('auth-email').fill(process.env['E2E_AUTH_EMAIL'] ?? '')
    await page.getByTestId('auth-password').fill(process.env['E2E_AUTH_PASSWORD'] ?? '')
    await page.getByTestId('auth-submit').click()
    await expect(page.getByTestId('tab-projects')).toBeVisible({ timeout: 15_000 })

    await openStudio(page)
    await page.getByTestId('merch-buy-button-mug').click()
    await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30_000 })
  })

  test('клик по футболке открывает модалку размера прежде, чем уйти в кассу', async ({ page }) => {
    await openStudio(page)
    await page.getByTestId('merch-buy-button-tshirt').click()
    await expect(page.getByTestId('merch-size-dialog')).toBeVisible()
    await expect(page.getByTestId('merch-size-m')).toBeVisible()
  })
})
