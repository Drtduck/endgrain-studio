import { expect, test, type Page } from '@playwright/test'
import path from 'node:path'
import { presetConsent } from './helpers/consent'

test.beforeEach(async ({ page }) => {
  await presetConsent(page)
})

// package.json не объявляет "type": "module", поэтому Playwright транспилирует спеки в CommonJS
// и import.meta.url там недоступен (SyntaxError на старте). __dirname даёт тот же путь без ESM.
const FIXTURE = path.join(__dirname, 'fixtures', 'demo-blocks.png')

async function openPhoto(page: Page): Promise<void> {
  await page.addInitScript(() => window.localStorage.clear())
  await page.goto('/')
  await expect(page.getByTestId('board-canvas')).toBeVisible()
  await page.getByTestId('tab-photo').click()
  await expect(page.getByTestId('photo-panel')).toBeVisible()
}

async function uploadFixture(page: Page): Promise<void> {
  await page.getByTestId('photo-file').setInputFiles(FIXTURE)
  await expect(page.getByTestId('photo-preview')).toBeVisible()
}

test('браузер даёт всё, что нужно для разбора картинки', async ({ page }) => {
  await openPhoto(page)
  const capabilities = await page.evaluate(() => ({
    bitmap: typeof createImageBitmap === 'function',
    context: document.createElement('canvas').getContext('2d') !== null,
  }))
  expect(capabilities).toEqual({ bitmap: true, context: true })
})

test('загруженная картинка превращается в доску', async ({ page }) => {
  await openPhoto(page)
  await uploadFixture(page)
  const rects = page.getByTestId('photo-preview').locator('svg rect')
  expect(await rects.count()).toBeGreaterThan(20)
  await expect(page.getByTestId('photo-stats')).toContainText('склеек')
})

test('ползунок щитов меняет число склеек', async ({ page }) => {
  await openPhoto(page)
  await uploadFixture(page)
  const stats = page.getByTestId('photo-stats')
  const detailed = await stats.textContent()

  // Клавиатура, а не fill: React не всегда видит программную запись в input[type=range].
  const slider = page.getByTestId('photo-panels')
  await slider.focus()
  for (let step = 0; step < 12; step += 1) await slider.press('ArrowLeft')

  await expect.poll(async () => stats.textContent()).not.toBe(detailed)
})

test('число пород задаётся ползунком', async ({ page }) => {
  await openPhoto(page)
  await uploadFixture(page)
  const before = await page.getByTestId('photo-preview').innerHTML()
  const slider = page.getByTestId('photo-colors')
  await slider.focus()
  await slider.press('ArrowRight')
  await slider.press('ArrowRight')
  await expect.poll(async () => page.getByTestId('photo-preview').innerHTML()).not.toBe(before)
})

test('узор по фотографии уезжает в редактор и считается', async ({ page }) => {
  await openPhoto(page)
  await uploadFixture(page)
  const first = await page.getByTestId('photo-preview').locator('svg rect').first().getAttribute('fill')

  await page.getByTestId('photo-apply').click()
  await expect(page.getByTestId('board-canvas')).toBeVisible()
  await expect(page.locator('rect[data-cell="r0:0"]')).toHaveAttribute('fill', first ?? '')
  // Счётчик сложности обязан посчитать фотодоску как любую другую.
  await expect(page.getByText(/Габарит:/)).toBeVisible()
})

test('текстовый файл отвергается', async ({ page }) => {
  await openPhoto(page)
  await page.getByTestId('photo-file').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('не картинка') })
  await expect(page.getByTestId('photo-error')).toBeVisible()
  await expect(page.getByTestId('photo-preview')).toBeHidden()
})

test('одна и та же картинка даёт одну и ту же доску', async ({ page }) => {
  await openPhoto(page)
  await uploadFixture(page)
  const first = await page.getByTestId('photo-preview').innerHTML()
  await page.reload()
  await page.getByTestId('tab-photo').click()
  await uploadFixture(page)
  expect(await page.getByTestId('photo-preview').innerHTML()).toBe(first)
})
