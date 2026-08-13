import { expect, test, type Page } from '@playwright/test'

/**
 * Базовый прогон идёт на 127.0.0.1 без заголовка страны, то есть в строгом
 * opt-in (см. lib/consent/regions.ts: пустой country даёт opt-in). Cookie
 * согласия здесь намеренно не предустанавливается - эти сценарии как раз
 * проверяют поведение баннера без решения.
 */
async function openStudio(page: Page): Promise<void> {
  await page.addInitScript(() => window.localStorage.clear())
  await page.goto('/')
  await expect(page.getByTestId('board-canvas')).toBeVisible()
}

test('без cookie в строгом режиме баннер виден, интерфейс не заблокирован', async ({ page }) => {
  await openStudio(page)
  const banner = page.getByTestId('consent-banner')
  await expect(banner).toBeVisible()
  await expect(banner.getByTestId('consent-accept')).toBeVisible()
  await expect(banner.getByTestId('consent-decline')).toBeVisible()
  // Элемент над баннером остаётся кликабельным: панель не блокирует интерфейс.
  await page.getByTestId('species-padauk').click()
})

test('«Принять» прячет баннер и пишет cookie granted', async ({ page }) => {
  await openStudio(page)
  await page.getByTestId('consent-accept').click()
  await expect(page.getByTestId('consent-banner')).toBeHidden()
  const cookies = await page.context().cookies()
  const consent = cookies.find((c) => c.name === 'eg-consent')
  expect(consent?.value).toMatch(/^1\.1\./)

  await page.reload()
  await expect(page.getByTestId('consent-banner')).toHaveCount(0)
})

test('«Отклонить» прячет баннер и пишет cookie denied', async ({ page }) => {
  await openStudio(page)
  await page.getByTestId('consent-decline').click()
  const cookies = await page.context().cookies()
  const consent = cookies.find((c) => c.name === 'eg-consent')
  expect(consent?.value).toMatch(/^1\.0\./)

  await page.reload()
  await expect(page.getByTestId('consent-banner')).toHaveCount(0)
})

test.describe('регион США (opt-out)', () => {
  test.use({ extraHTTPHeaders: { 'x-vercel-ip-country': 'US' } })

  test('баннер-уведомление с кнопкой отключения аналитики', async ({ page }) => {
    await openStudio(page)
    const banner = page.getByTestId('consent-banner')
    await expect(banner).toBeVisible()
    await expect(banner.getByTestId('consent-disable-analytics')).toBeVisible()
    await expect(banner.getByTestId('consent-accept')).toHaveCount(0)

    await banner.getByTestId('consent-disable-analytics').click()
    const cookies = await page.context().cookies()
    const consent = cookies.find((c) => c.name === 'eg-consent')
    expect(consent?.value).toMatch(/^1\.0\.opt-out\.banner\./)
  })
})

test.describe('Global Privacy Control', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'globalPrivacyControl', { value: true, configurable: true })
    })
  })

  test('показывает подтверждение обработки сигнала и пишет source=gpc', async ({ page }) => {
    await openStudio(page)
    await expect(page.getByTestId('consent-gpc-ack')).toBeVisible()
    await expect(page.getByTestId('consent-banner')).toHaveCount(0)
    await expect
      .poll(async () => {
        const cookies = await page.context().cookies()
        return cookies.find((c) => c.name === 'eg-consent')?.value ?? ''
      })
      .toContain('.gpc.')
  })
})

test('баннер виден и на /landing, и на /; выбор не переспрашивается между ними', async ({ page }) => {
  await page.goto('/landing')
  await expect(page.getByTestId('consent-banner')).toBeVisible()
  await page.getByTestId('consent-accept').click()
  await expect(page.getByTestId('consent-banner')).toBeHidden()

  await openStudio(page)
  await expect(page.getByTestId('consent-banner')).toHaveCount(0)
})

test('регистрация без галочки согласия не отправляется, ошибка видна и пропадает после отметки', async ({ page }) => {
  await page.goto('/register')
  await page.getByTestId('auth-email').fill(`test+${Date.now()}@example.com`)
  await page.getByTestId('auth-password').fill('password123456')
  await page.getByTestId('auth-submit').click()
  await expect(page.getByTestId('auth-error')).toBeVisible()

  await page.getByTestId('auth-consent').check()
  await expect(page.getByTestId('auth-error')).toHaveCount(0)
})

// Без measurement id ни один запрос на googletagmanager.com не уходит: состояние CI.
test('без NEXT_PUBLIC_GA_MEASUREMENT_ID ни один запрос к googletagmanager.com не уходит', async ({ page }) => {
  const requests: string[] = []
  page.on('request', (req) => {
    if (req.url().includes('googletagmanager.com')) requests.push(req.url())
  })
  await openStudio(page)
  await page.getByTestId('consent-accept').click()
  await page.waitForTimeout(500)
  expect(requests).toEqual([])
})

test('экспорт PDF кладёт pdf_exported в dataLayer', async ({ page }) => {
  await openStudio(page)
  await page.getByTestId('consent-accept').click()
  await page.getByTestId('export-pdf').click()
  // gtag.js разбирает dataLayer в arguments-форме (['event', name, params]),
  // а не как объект {event: name, ...}: см. lib/analytics/gtag.ts.
  await expect
    .poll(() =>
      page.evaluate(() => (window.dataLayer ?? []).some((e: unknown) => Array.isArray(e) && e[0] === 'event' && e[1] === 'pdf_exported')),
    )
    .toBe(true)
})
