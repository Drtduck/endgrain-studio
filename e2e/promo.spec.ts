import { expect, test, type Page } from '@playwright/test'

async function openStudio(page: Page): Promise<void> {
  await page.addInitScript(() => window.localStorage.clear())
  await page.goto('/')
  await expect(page.getByTestId('board-canvas')).toBeVisible()
}

test('вкладка «Промо» открывается и показывает обе панели', async ({ page }) => {
  await openStudio(page)
  await page.getByTestId('tab-promo').click()
  await expect(page.getByTestId('promo-panel')).toBeVisible()
  await expect(page.getByTestId('promo-photo')).toBeVisible()
  await expect(page.getByTestId('promo-merch')).toBeVisible()
})

test('без ключа Gemini видна мок-галерея из четырёх кадров с честной подписью', async ({ page }) => {
  await openStudio(page)
  await page.getByTestId('tab-promo').click()
  const gallery = page.getByTestId('promo-gallery')
  await expect(gallery).toBeVisible()
  for (const kind of ['hero', 'lifestyle', 'macro', 'package']) {
    await expect(page.getByTestId(`promo-shot-${kind}`)).toBeVisible()
  }
  await expect(page.getByTestId('promo-note')).toContainText('GEMINI_API_KEY')

  await page.getByTestId('promo-generate').click()
  // Без ключа действие возвращает мок-режим: галерея остаётся на месте и ошибки нет.
  await expect(page.getByTestId('promo-error')).toHaveCount(0)
  await expect(page.getByTestId('promo-shot-hero')).toBeVisible()
})

test('без ключа Printful видны локальные мокапы мерча и нет кнопки Printful', async ({ page }) => {
  await openStudio(page)
  await page.getByTestId('tab-promo').click()
  for (const id of ['tshirt', 'mug', 'poster', 'apron']) {
    await expect(page.getByTestId(`merch-item-${id}`)).toBeVisible()
  }
  await expect(page.getByTestId('merch-printful')).toHaveCount(0)

  await page.getByTestId('merch-generate').click()
  await expect(page.getByTestId('merch-note')).toContainText('PRINTFUL_API_KEY')
  await expect(page.getByTestId('merch-printful')).toHaveCount(0)
})

test('рекомендации инструментов видны рядом с экспортом и ведут по партнёрским ссылкам', async ({ page }) => {
  await openStudio(page)
  const block = page.getByTestId('tool-recommendations')
  await expect(block).toBeVisible()
  const links = block.locator('a[data-testid^="recommend-"]')
  await expect(links.first()).toBeVisible()
  await expect(links.first()).toHaveAttribute('rel', /sponsored/)
  await expect(page.getByTestId('recommend-disclosure')).toContainText('Amazon')
})
