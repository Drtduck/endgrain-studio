import { expect, test } from '@playwright/test'

/**
 * CI не даёт GEMINI_API_KEY и живого Supabase (см. playwright.config.ts, студия
 * поднята на PUBLIC_STUDIO=1 без внешних ключей и без облака), поэтому карточка
 * товара всегда идёт по демо-ветке: generateListingAction собирает demo-текст
 * без единого запроса наружу, а сохранение (нет аккаунта/Supabase) тихо падает
 * в localStorage - тот же приём, на котором держится вся студия без входа.
 */

async function openListing(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/?tab=editor')
  await expect(page.getByTestId('board-canvas')).toBeVisible()
  await page.getByTestId('tab-promo').click()
  await expect(page.getByTestId('promo-listing')).toBeVisible()
}

test('демо-режим отдаёт карточку без ключа Gemini', async ({ page }) => {
  await openListing(page)
  await page.getByTestId('listing-generate').click()
  await expect(page.getByTestId('listing-mock-note')).toBeVisible()
  await expect(page.getByTestId('listing-title')).not.toHaveValue('')
  await expect(page.getByTestId('listing-description')).not.toHaveValue('')
})

test('смена площадки в карточке меняет лимиты полей', async ({ page }) => {
  await openListing(page)
  const titleField = page.getByTestId('listing-title')
  await page.getByTestId('listing-marketplace').selectOption('etsy')
  await expect(titleField).toHaveAttribute('data-testid', 'listing-title')
  await page.getByTestId('listing-generate').click()
  const etsyTitle = await titleField.inputValue()
  expect(etsyTitle.length).toBeLessThanOrEqual(140)

  await page.getByTestId('listing-marketplace').selectOption('amazon')
  await page.getByTestId('listing-generate').click()
  const amazonTitle = await titleField.inputValue()
  expect(amazonTitle.length).toBeLessThanOrEqual(200)
})

test('карточка сохраняется и переживает перезагрузку страницы (демо, без Supabase - localStorage)', async ({ page }) => {
  await openListing(page)
  await page.getByTestId('listing-generate').click()
  await expect(page.getByTestId('listing-title')).not.toHaveValue('')

  const title = await page.getByTestId('listing-title').inputValue()
  await page.getByTestId('listing-title').fill(`${title} - edited by hand`)
  await page.getByTestId('listing-save').click()

  await page.reload()
  await expect(page.getByTestId('promo-listing')).toBeVisible()
  await expect(page.getByTestId('listing-title')).toHaveValue(`${title} - edited by hand`)
})

test('кнопка «Скопировать всё» кладёт текст в буфер', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await openListing(page)
  await page.getByTestId('listing-generate').click()
  await expect(page.getByTestId('listing-title')).not.toHaveValue('')

  await page.getByTestId('listing-copy-all').click()
  const clipboardText = await page.evaluate(() => navigator.clipboard.readText())
  const title = await page.getByTestId('listing-title').inputValue()
  expect(clipboardText).toContain(title)
})

// Без ключа fal.ai мок бесплатен (см. app/actions/video.ts): до кошелька дело
// не доходит вовсе. Живой прогон с настоящим списанием требует Supabase и
// аккаунта, здесь без ключей проверяем только гейт по входу.
test('видео-панель недоступна без входа: кошелёк требует пользователя', async ({ page }) => {
  await page.goto('/?tab=editor')
  await page.getByTestId('tab-promo').click()
  await expect(page.getByTestId('promo-video')).toBeVisible()
  await expect(page.getByTestId('video-gate')).toBeVisible()
  await expect(page.getByTestId('video-generate')).toBeDisabled()
})
