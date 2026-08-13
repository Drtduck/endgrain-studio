import { expect, test, type Page } from '@playwright/test'
import { presetConsent } from './helpers/consent'

test.beforeEach(async ({ page }) => {
  await presetConsent(page)
})

// Сценарии описывают поведение без ключей: панели показывают заглушки и честно называют
// недостающую переменную. С настоящим ключом в окружении генерация платная и ответ другой,
// поэтому такие прогоны пропускаем (тот же приём, что в auth.spec.ts с E2E_AUTH).
const noKeys = (process.env['GEMINI_API_KEY'] ?? '') === '' && (process.env['PRINTFUL_API_KEY'] ?? '') === ''

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

test('без ключа Gemini видна мок-галерея набора по умолчанию с честной подписью', async ({ page }) => {
  test.skip(!noKeys, 'в окружении есть ключ: генерация платная и отвечает не заглушками')
  await openStudio(page)
  await page.getByTestId('tab-promo').click()
  const gallery = page.getByTestId('promo-gallery')
  await expect(gallery).toBeVisible()
  // Набор по умолчанию: четыре отмеченных пресета из двенадцати.
  for (const kind of ['hero', 'serving', 'macroOil', 'package']) {
    await expect(page.getByTestId(`promo-shot-${kind}`)).toBeVisible()
  }
  // Неотмеченный пресет в сетке не рисуется: за него никто не платил.
  await expect(page.getByTestId('promo-shot-catalog')).toHaveCount(0)
  // До нажатия кнопки панель не имеет права утверждать, что ключа нет: она этого не знает.
  await expect(page.getByTestId('promo-note')).not.toContainText('GEMINI_API_KEY')

  await page.getByTestId('promo-generate').click()
  // Без ключа действие возвращает мок-режим: галерея остаётся на месте и ошибки нет.
  await expect(page.getByTestId('promo-note')).toContainText('GEMINI_API_KEY')
  await expect(page.getByTestId('promo-error')).toHaveCount(0)
  await expect(page.getByTestId('promo-shot-hero')).toBeVisible()
})

test('набор кадров выбирается чипами, и цена в квоте меняется вместе с ним', async ({ page }) => {
  await openStudio(page)
  await page.getByTestId('tab-promo').click()
  const cost = page.getByTestId('promo-cost')
  await expect(cost).toContainText('4')
  await page.getByTestId('promo-preset-catalog').click()
  await expect(cost).toContainText('5')
  await expect(page.getByTestId('promo-shot-catalog')).toBeVisible()
  // Снять можно тем же нажатием: кадр уходит из сетки.
  await page.getByTestId('promo-preset-catalog').click()
  await expect(page.getByTestId('promo-shot-catalog')).toHaveCount(0)
})

test('панель съёмки по референсу открыта и честно предупреждает про стиль', async ({ page }) => {
  await openStudio(page)
  await page.getByTestId('tab-promo').click()
  await expect(page.getByTestId('promo-reference')).toBeVisible()
  await expect(page.getByTestId('ref-disclaimer')).toContainText('стил')
  // Без файла разбирать нечего.
  await expect(page.getByTestId('ref-analyze')).toBeDisabled()
})

test('без ключа Printful видны локальные мокапы мерча и нет кнопки Printful', async ({ page }) => {
  test.skip(!noKeys, 'в окружении есть ключ: кнопка Printful появится, и это другой сценарий')
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

test('товары для Printful выбираются чипами, по умолчанию два', async ({ page }) => {
  await openStudio(page)
  await page.getByTestId('tab-promo').click()
  await expect(page.getByTestId('merch-pick-tshirt')).toHaveAttribute('aria-pressed', 'true')
  // Printful пускает пару мокапов в минуту, поэтому все четыре разом не отмечены.
  await expect(page.getByTestId('merch-pick-poster')).toHaveAttribute('aria-pressed', 'false')
  await page.getByTestId('merch-pick-poster').click()
  await expect(page.getByTestId('merch-pick-poster')).toHaveAttribute('aria-pressed', 'true')
})

test('рекомендации инструментов видны в левой колонке и ведут по партнёрским ссылкам', async ({ page }) => {
  await openStudio(page)
  const block = page.getByTestId('tool-recommendations')
  await expect(block).toBeVisible()
  const links = block.locator('a[data-testid^="recommend-"]')
  await expect(links.first()).toBeVisible()
  await expect(links.first()).toHaveAttribute('rel', /sponsored/)
  await expect(page.getByTestId('recommend-disclosure')).toContainText('Amazon')
})
