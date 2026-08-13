import { expect, test } from '@playwright/test'

/**
 * CI не даёт GEMINI_API_KEY (см. playwright.config.ts, студия поднята на
 * PUBLIC_STUDIO=1 без внешних ключей), поэтому карточка товара всегда идёт по
 * демо-ветке: demoListing собирается без единого запроса наружу и без входа
 * в аккаунт, ровно как остальные панели вкладки «Промо» без ключей.
 */

async function openListing(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/')
  await expect(page.getByTestId('board-canvas')).toBeVisible()
  await page.getByTestId('tab-promo').click()
  await expect(page.getByTestId('promo-listing')).toBeVisible()
}

test('демо-режим отдаёт карточку без ключа Gemini', async ({ page }) => {
  await openListing(page)
  await page.getByTestId('listing-generate').click()
  await expect(page.getByTestId('listing-result')).toBeVisible()
  await expect(page.getByTestId('listing-mock-note')).toBeVisible()
  await expect(page.getByTestId('listing-field-title-value')).not.toBeEmpty()
  await expect(page.getByTestId('listing-field-keywords-value')).not.toBeEmpty()
})

test('кнопка «Скопировать» кладёт текст в буфер', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await openListing(page)
  await page.getByTestId('listing-generate').click()
  await expect(page.getByTestId('listing-result')).toBeVisible()

  const titleValue = await page.getByTestId('listing-field-title-value').textContent()
  await page.getByTestId('listing-field-title-copy').click()

  const clipboardText = await page.evaluate(() => navigator.clipboard.readText())
  expect(clipboardText).toBe(titleValue)
})

// Без ключа fal.ai мок бесплатен (см. app/actions/video.ts): до кошелька дело
// не доходит вовсе. Живой прогон с настоящим списанием требует Supabase и
// аккаунта, здесь без ключей проверяем только гейт по входу.
test('видео-панель недоступна без входа: кошелёк требует пользователя', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('tab-promo').click()
  await expect(page.getByTestId('promo-video')).toBeVisible()
  await expect(page.getByTestId('video-gate')).toBeVisible()
  await expect(page.getByTestId('video-generate')).toBeDisabled()
})
