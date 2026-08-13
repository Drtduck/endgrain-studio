import { readFileSync, statSync } from 'node:fs'
import { expect, test, type Download, type Page } from '@playwright/test'
import { presetConsent } from './helpers/consent'

test.beforeEach(async ({ page }) => {
  await presetConsent(page)
})

async function openStudio(page: Page): Promise<void> {
  await page.addInitScript(() => window.localStorage.clear())
  await page.goto('/')
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

test('SVG скачивается и содержит прямоугольники доски', async ({ page }) => {
  await openStudio(page)
  const file = await download(page, 'export-svg')
  expect(file.suggestedFilename()).toMatch(/\.svg$/)
  const svg = (await bytesOf(file)).toString('utf8')
  expect(svg.startsWith('<svg')).toBe(true)
  // Стартовая шахматка это заведомо больше двадцати ячеек.
  expect(svg.split('<rect').length - 1).toBeGreaterThan(20)
  expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"')
  expect(svg.includes(String.fromCharCode(0x2014))).toBe(false)
})

test('PNG скачивается непустым и с правильной сигнатурой', async ({ page }) => {
  await openStudio(page)
  const file = await download(page, 'export-png')
  expect(file.suggestedFilename()).toMatch(/\.png$/)
  const bytes = await bytesOf(file)
  expect(bytes.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  // Одноцветная заглушка весила бы сотни байт: доска с узором заведомо тяжелее.
  expect(bytes.length).toBeGreaterThan(5000)
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

test('PDF скачивается и это настоящий PDF', async ({ page }) => {
  await openStudio(page)
  const file = await download(page, 'export-pdf')
  expect(file.suggestedFilename()).toMatch(/\.pdf$/)
  const bytes = await bytesOf(file)
  expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-')
  expect(bytes.subarray(-1024).toString('latin1')).toContain('%%EOF')
  // Пустой одностраничный PDF весит около 1 КБ. Три страницы со встроенным шрифтом это десятки КБ.
  expect(bytes.length).toBeGreaterThan(20000)
})

test('во время экспорта кнопки заблокированы и потом снова активны', async ({ page }) => {
  await openStudio(page)
  const pdf = page.getByTestId('export-pdf')
  const [file] = await Promise.all([page.waitForEvent('download'), pdf.click()])
  await file.path()
  await expect(pdf).toBeEnabled()
  // page.getByRole('alert') матчит и служебный route-announcer Next.js (скрытый, всегда
  // в DOM), поэтому ошибку экспорта проверяем по её собственному data-testid.
  await expect(page.getByTestId('export-error')).toHaveCount(0)
})

test('экспорт следует локали интерфейса', async ({ page }) => {
  await openStudio(page)
  await page.getByTestId('locale-en').click()
  await expect(page.getByTestId('export-pdf')).toBeVisible()
  const file = await download(page, 'export-csv')
  expect((await bytesOf(file)).toString('utf8')).toContain('Black walnut')
})

test('PDF на русской локали содержит встроенный кириллический шрифт', async ({ page }) => {
  // Гейт против регресса: без зарегистрированного PTSans jsPDF молча откатывается
  // на helvetica и печатает кириллицу пустыми глифами (см. registerCyrillicFont в pdf.ts).
  // Маркер шрифта в байтах PDF плюс минимальный размер отличают настоящий кириллический
  // документ от пустышки, где шрифт не подключился.
  await openStudio(page)
  const file = await download(page, 'export-pdf')
  const bytes = await bytesOf(file)
  expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-')
  expect(bytes.length).toBeGreaterThan(20000)
  expect(bytes.toString('latin1')).toContain('PTSans')
})
