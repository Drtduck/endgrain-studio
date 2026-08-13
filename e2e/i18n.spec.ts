import { expect, test, type Page } from '@playwright/test'
import { presetConsent } from './helpers/consent'

test.beforeEach(async ({ page }) => {
  await presetConsent(page)
})

const CYRILLIC = /[Ѐ-ӿ]/

/** Вкладки студии, кроме тех, что требуют аккаунта или ключей: их содержимое всё равно пустое. */
const TABS = ['editor', 'templates', 'generate', 'photo', 'view3d', 'books', 'promo'] as const

async function openStudio(page: Page, locale: 'ru' | 'en'): Promise<void> {
  await page.context().addCookies([{ name: 'eg-locale', value: locale, url: 'http://127.0.0.1:3100' }])
  await page.addInitScript(() => window.localStorage.clear())
  await page.goto('/')
  await expect(page.getByTestId('board-canvas')).toBeVisible()
}

test('студия открывается на языке лендинга', async ({ page }) => {
  await openStudio(page, 'en')
  await expect(page.getByTestId('locale-en')).toHaveClass(/bg-surface-raised/)
  await expect(page.getByTestId('board-name')).toHaveAttribute('placeholder', 'Checkerboard')
})

test('ни на одной вкладке английской студии нет русского текста', async ({ page }) => {
  await openStudio(page, 'en')
  for (const tab of TABS) {
    await page.getByTestId(`tab-${tab}`).click()
    // innerText это ровно то, что человек видит: скрытые узлы сюда не попадают.
    const visible = await page.evaluate(() => document.body.innerText)
    expect(visible, `вкладка ${tab}`).not.toMatch(CYRILLIC)
  }
})

test('имя шаблона переезжает на английский вместе с интерфейсом', async ({ page }) => {
  await openStudio(page, 'ru')
  await page.getByTestId('tab-templates').click()
  await page.getByTestId('template-chess-8x8').click()
  await expect(page.getByTestId('board-name')).toHaveAttribute('placeholder', 'Шахматная доска 8 на 8')

  await page.getByTestId('locale-en').click()
  await expect(page.getByTestId('board-name')).toHaveAttribute('placeholder', 'Chessboard 8 by 8')
})

test('сброс не возвращает язык к русскому', async ({ page }) => {
  await openStudio(page, 'en')
  await page.getByTestId('reset-studio').click()
  await page.getByTestId('reset-confirm').click()
  await expect(page.getByTestId('locale-en')).toHaveClass(/bg-surface-raised/)
  await expect(page.getByTestId('board-name')).toHaveAttribute('placeholder', 'Checkerboard')
})

test('имя скачанного CSV в английской локали без кириллицы', async ({ page }) => {
  await openStudio(page, 'en')
  const [file] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-csv').click()])
  expect(file.suggestedFilename()).not.toMatch(CYRILLIC)
})
