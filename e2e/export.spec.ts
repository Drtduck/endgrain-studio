import { readFileSync, statSync } from 'node:fs'
import { expect, test, type Download, type Page } from '@playwright/test'
import { presetConsent } from './helpers/consent'

test.beforeEach(async ({ page }) => {
  await presetConsent(page)
})

async function openStudio(page: Page): Promise<void> {
  await page.addInitScript(() => window.localStorage.clear())
  await page.goto('/?tab=editor')
  await expect(page.getByTestId('board-canvas')).toBeVisible()
}

async function download(page: Page, testId: string): Promise<Download> {
  const [file] = await Promise.all([page.waitForEvent('download'), page.getByTestId(testId).click()])
  return file
}

async function bytesOf(file: Download): Promise<Buffer> {
  const path = await file.path()
  expect(path).not.toBeNull()
  if (path === null) throw new Error('файл не сохранился')
  expect(statSync(path).size).toBeGreaterThan(0)
  return readFileSync(path)
}

/** Кнопка печати открывает вкладку с инструкцией: возвращаем уже загруженную страницу. */
async function openPrintTab(page: Page): Promise<Page> {
  const [printed] = await Promise.all([
    page.context().waitForEvent('page'),
    page.getByTestId('export-print').click(),
  ])
  await printed.waitForLoadState()
  return printed
}

test('в панели экспорта остались только печать и CSV', async ({ page }) => {
  await openStudio(page)
  await expect(page.getByTestId('export-print')).toBeVisible()
  await expect(page.getByTestId('export-csv')).toBeVisible()
  for (const gone of ['export-png', 'export-png-hd', 'export-svg', 'export-pdf']) {
    await expect(page.getByTestId(gone)).toHaveCount(0)
  }
})

test('CSV скачивается с заголовком и строками на каждую полосу', async ({ page }) => {
  await openStudio(page)
  const file = await download(page, 'export-csv')
  expect(file.suggestedFilename()).toMatch(/\.csv$/)
  const text = (await bytesOf(file)).toString('utf8')
  expect(text.charCodeAt(0)).toBe(0xfeff)
  const lines = text.replace(/^﻿/, '').split('\r\n').filter((l) => l !== '')
  expect(lines[0]).toContain('panel')
  expect(lines.length).toBeGreaterThan(5)
  expect(lines[1]?.split(';').length).toBe(lines[0]?.split(';').length)
})

test('кнопка печати открывает инструкцию с логотипом, схемой и шагами', async ({ page }) => {
  await openStudio(page)
  const printed = await openPrintTab(page)

  expect(new URL(printed.url()).pathname).toBe('/print')
  // Проект уезжает хэшем: печатная вкладка не знает про стор студии.
  expect(new URL(printed.url()).hash.length).toBeGreaterThan(1)

  await expect(printed.getByTestId('print-brand')).toBeVisible()
  await expect(printed.getByTestId('print-brand').locator('img')).toHaveAttribute('src', '/brand/beaver-mark.png')
  await expect(printed.getByTestId('print-preview').locator('svg')).toBeVisible()
  for (const id of ['print-specs', 'print-species', 'print-cutmap', 'print-steps', 'print-rows']) {
    await expect(printed.getByTestId(id)).toBeVisible()
  }
  await expect(printed.getByTestId('print-steps').locator('li').first()).toBeVisible()
  await expect(printed.getByTestId('print-empty')).toHaveCount(0)
  await expect(printed.getByTestId('export-error')).toHaveCount(0)
})

test('кнопка «Печать» на инструкции зовёт диалог браузера', async ({ page }) => {
  await openStudio(page)
  const printed = await openPrintTab(page)
  // window.print в headless-браузере блокирующий, поэтому подменяем его флагом.
  await printed.evaluate(() => {
    // @ts-expect-error флаг только для теста
    window.__printed = false
    // @ts-expect-error флаг только для теста
    window.print = () => { window.__printed = true }
  })
  await printed.getByTestId('print-now').click()
  // @ts-expect-error флаг только для теста
  expect(await printed.evaluate(() => window.__printed)).toBe(true)
})

test('печатная страница без проекта показывает подсказку, а не пустоту', async ({ page }) => {
  await page.addInitScript(() => window.localStorage.clear())
  await page.goto('/print')
  await expect(page.getByTestId('print-empty')).toBeVisible()
})

test('печатный режим: ключевые секции видимы и фон рядов не прозрачный', async ({ page }) => {
  await openStudio(page)
  const printed = await openPrintTab(page)
  await printed.emulateMedia({ media: 'print' })

  for (const id of ['print-brand', 'print-title', 'print-preview', 'print-specs', 'print-species', 'print-cutmap', 'print-steps', 'print-rows']) {
    await expect(printed.getByTestId(id)).toBeVisible()
  }

  // Полоса ряда красится через bg-neutral-100: без print-color-adjust браузер
  // печатает фон как полностью прозрачный, и полоса превращается в пустой прямоугольник.
  const rowBar = printed.getByTestId('print-rows').locator('li').first().locator('span').nth(1)
  const background = await rowBar.evaluate((el) => window.getComputedStyle(el).backgroundColor)
  expect(background).not.toBe('rgba(0, 0, 0, 0)')
  expect(background).not.toBe('transparent')

  // Сам документ обязан просить браузер печатать фон точно: иначе печать зависит
  // от галочки «Background graphics», выключенной в большинстве браузеров по умолчанию.
  const colorAdjust = await printed.locator('.print-doc').evaluate((el) => window.getComputedStyle(el).getPropertyValue('print-color-adjust') || window.getComputedStyle(el).getPropertyValue('-webkit-print-color-adjust'))
  expect(colorAdjust).toBe('exact')
})

test('экспорт следует локали интерфейса', async ({ page }) => {
  await openStudio(page)
  await page.getByTestId('locale-en').click()
  await expect(page.getByTestId('export-print')).toBeVisible()
  const file = await download(page, 'export-csv')
  expect((await bytesOf(file)).toString('utf8')).toContain('Black walnut')
})
