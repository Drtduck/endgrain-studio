import { expect, test, type Page } from '@playwright/test'

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

  test('обе кнопки PNG работают, замка нет', async ({ page }) => {
    await openStudio(page)
    const hd = page.getByTestId('export-png-hd')
    await expect(hd).toBeVisible()
    // Без кассы всё открыто: кнопка не ссылка на тарифы, а настоящий экспорт.
    await expect(hd).not.toHaveAttribute('href', '/pricing')

    for (const id of ['export-png', 'export-png-hd']) {
      const [file] = await Promise.all([page.waitForEvent('download'), page.getByTestId(id).click()])
      expect(file.suggestedFilename()).toMatch(/\.png$/)
      expect(await file.path()).not.toBeNull()
    }
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
    // Форму Stripe не заполняем: это был бы тест чужой вёрстки. Проверяем ровно то,
    // за что отвечаем сами: сессия создалась и нас на неё увели.
    await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30_000 })
  })
})
