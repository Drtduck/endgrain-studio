import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { presetConsent } from './helpers/consent'

test.beforeEach(async ({ page }) => {
  await presetConsent(page)
})

async function openStudio(page: Page): Promise<void> {
  await page.addInitScript(() => window.localStorage.clear())
  await page.goto('/')
  await expect(page.getByTestId('board-canvas')).toBeVisible()
}

/** Число из текста «Отходы» в блоке материала: '12.3%' -> 12.3. */
async function wastePct(page: Page): Promise<number> {
  const text = await page.getByText('Отходы').locator('..').locator('dd').innerText()
  const match = text.match(/-?\d+(\.\d+)?/)
  expect(match, `не нашли число в "${text}"`).not.toBeNull()
  return Number.parseFloat(match![0])
}

test('шаблон шеврона: превью рисует угловые ячейки полигонами, а не прямоугольниками', async ({ page }) => {
  await openStudio(page)
  await page.getByTestId('tab-templates').click()
  await expect(page.getByTestId('template-gallery')).toBeVisible()

  await page.getByTestId('template-chevron-classic').click()
  await expect(page.getByTestId('board-canvas')).toBeVisible()

  const board = page.getByTestId('board-canvas')
  await expect(board.locator('polygon[data-cell]')).not.toHaveCount(0)
  // Все ячейки шеврона наклонные: ни одна не должна остаться прямоугольником.
  await expect(board.locator('rect[data-cell]')).toHaveCount(0)
})

test('шаблон шеврона: cutlist (CSV) показывает угловой рез', async ({ page }) => {
  await openStudio(page)
  await page.getByTestId('tab-templates').click()
  await page.getByTestId('template-chevron-classic').click()
  await expect(page.getByTestId('board-canvas')).toBeVisible()

  const [file] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-csv').click()])
  const path = await file.path()
  expect(path).not.toBeNull()
  const text = readFileSync(path!, 'utf8')
  const header = text.replace(/^﻿/, '').split('\r\n')[0]!.split(';')
  const angleIdx = header.indexOf('angle_deg')
  expect(angleIdx).toBeGreaterThanOrEqual(0)
  const rows = text.split('\r\n').slice(1).filter((l) => l !== '')
  const angles = rows.map((r) => r.split(';')[angleIdx])
  // Колонки шеврона наклонены на 45 градусов, поочерёдно в обе стороны.
  expect(angles).toContain('45')
  expect(angles).toContain('-45')
})

test('шаблон шеврона: вкладка 3D рисуется без ошибок', async ({ page }) => {
  await openStudio(page)
  await page.getByTestId('tab-templates').click()
  await page.getByTestId('template-chevron-classic').click()
  await expect(page.getByTestId('board-canvas')).toBeVisible()

  await page.getByTestId('tab-view3d').click()
  const canvas = page.locator('[data-testid="view3d"] canvas')
  await expect(canvas).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('view3d-unsupported')).toHaveCount(0)
})

test('шаблон шеврона: PDF выгружается непустым файлом', async ({ page }) => {
  await openStudio(page)
  await page.getByTestId('tab-templates').click()
  await page.getByTestId('template-chevron-classic').click()
  await expect(page.getByTestId('board-canvas')).toBeVisible()

  const [file] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-pdf').click()])
  const path = await file.path()
  expect(path).not.toBeNull()
})

test('угол среза в инспекторе панели двигает отход в блоке материала', async ({ page }) => {
  await openStudio(page)
  await page.getByTestId('tab-templates').click()
  await page.getByTestId('template-chevron-classic').click()
  await expect(page.getByTestId('board-canvas')).toBeVisible()

  const before = await wastePct(page)

  const angleInput = page.getByTestId('strip-MAIN-0-angle')
  await angleInput.scrollIntoViewIfNeeded()
  await angleInput.fill('58')
  await angleInput.blur()

  await expect(async () => {
    const after = await wastePct(page)
    expect(after).toBeGreaterThan(before)
  }).toPass({ timeout: 5_000 })
})
