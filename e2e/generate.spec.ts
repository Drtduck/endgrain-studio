import { expect, test, type Page } from '@playwright/test'
import { presetConsent } from './helpers/consent'

test.beforeEach(async ({ page }) => {
  await presetConsent(page)
})

async function openGenerator(page: Page): Promise<void> {
  await page.addInitScript(() => window.localStorage.clear())
  await page.goto('/')
  await expect(page.getByTestId('board-canvas')).toBeVisible()
  await page.getByTestId('tab-generate').click()
  await expect(page.getByTestId('generator-panel')).toBeVisible()
}

test('генератор показывает девять вариантов', async ({ page }) => {
  await openGenerator(page)
  await expect(page.locator('[data-testid^="gen-card-"]')).toHaveCount(9)
  // В каждой карточке настоящая доска, а не заглушка.
  for (let index = 0; index < 9; index += 1) {
    const rects = page.locator(`[data-testid="gen-card-${index}"] svg rect`)
    await expect(rects.first()).toBeVisible()
    expect(await rects.count()).toBeGreaterThan(10)
  }
  await expect(page.getByTestId('gen-generation')).toContainText('1')
})

test('первая девятка одинакова после перезагрузки', async ({ page }) => {
  await openGenerator(page)
  const before = await page.getByTestId('gen-card-0').innerHTML()
  await page.reload()
  await page.getByTestId('tab-generate').click()
  await expect(page.getByTestId('generator-panel')).toBeVisible()
  expect(await page.getByTestId('gen-card-0').innerHTML()).toBe(before)
})

test('перемешать меняет все доски', async ({ page }) => {
  await openGenerator(page)
  const before = await page.getByTestId('gen-card-0').innerHTML()
  await page.getByTestId('gen-shuffle').click()
  await expect.poll(async () => page.getByTestId('gen-card-0').innerHTML()).not.toBe(before)
})

test('раунд эволюции сохраняет избранное и меняет остальных', async ({ page }) => {
  await openGenerator(page)
  await page.getByTestId('gen-fav-2').click()
  await expect(page.getByTestId('gen-fav-2')).toHaveAttribute('aria-pressed', 'true')
  const favourite = await page.getByTestId('gen-card-2').getByRole('img').first().innerHTML()
  const otherBefore = await page.getByTestId('gen-card-5').getByRole('img').first().innerHTML()

  await page.getByTestId('gen-evolve').click()
  await expect(page.getByTestId('gen-generation')).toContainText('2')
  expect(await page.getByTestId('gen-card-0').getByRole('img').first().innerHTML()).toBe(favourite)
  expect(await page.getByTestId('gen-card-5').getByRole('img').first().innerHTML()).not.toBe(otherBefore)
})

test('семейство фильтрует девятку', async ({ page }) => {
  await openGenerator(page)
  await page.getByTestId('gen-family-stripes').click()
  await expect(page.getByTestId('gen-family-stripes')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('[data-testid^="gen-card-"]')).toHaveCount(9)
})

test('выбранный узор уезжает в редактор', async ({ page }) => {
  await openGenerator(page)
  const chosen = await page.getByTestId('gen-card-1').locator('svg rect').first().getAttribute('fill')
  await page.getByTestId('gen-apply-1').click()
  await expect(page.getByTestId('board-canvas')).toBeVisible()
  await expect(page.locator('rect[data-cell="r0:0"]')).toHaveAttribute('fill', chosen ?? '')
})

test('узор поверх правок сначала спрашивает', async ({ page }) => {
  await page.addInitScript(() => window.localStorage.clear())
  await page.goto('/')
  await expect(page.getByTestId('board-canvas')).toBeVisible()
  const thickness = page.getByTestId('board-thickness')
  await thickness.fill('58')
  await thickness.blur()

  await page.getByTestId('tab-generate').click()
  await page.getByTestId('gen-apply-0').click()
  await expect(page.getByTestId('generator-confirm-dialog')).toBeVisible()
  await page.getByTestId('generator-cancel').click()
  await expect(page.getByTestId('generator-confirm-dialog')).toBeHidden()

  await page.getByTestId('gen-apply-0').click()
  await page.getByTestId('generator-confirm').click()
  await expect(page.getByTestId('board-canvas')).toBeVisible()
})

test('генератор не теряет популяцию при уходе на другую вкладку', async ({ page }) => {
  await openGenerator(page)
  await page.getByTestId('gen-shuffle').click()
  const html = await page.getByTestId('gen-card-3').innerHTML()
  await page.getByTestId('tab-editor').click()
  await expect(page.getByTestId('board-canvas')).toBeVisible()
  await page.getByTestId('tab-generate').click()
  expect(await page.getByTestId('gen-card-3').innerHTML()).toBe(html)
})
