import { expect, test, type Page } from '@playwright/test'
import { presetConsent } from './helpers/consent'

// Баннер согласия перекрывает нижнюю часть экрана без решения в cookie: предустановка
// нужна первой, иначе она ломает клики во всех сценариях ниже (см. e2e/helpers/consent.ts).
test.beforeEach(async ({ page }) => {
  await presetConsent(page)
})

/** Стартовый проект - шахматка, панели переиспользуются, поэтому покраска всегда идёт через форк. */
async function openStudio(page: Page): Promise<void> {
  await page.addInitScript(() => window.localStorage.clear())
  await page.goto('/?tab=editor')
  await expect(page.getByTestId('board-canvas')).toBeVisible()
}

function cell(page: Page, id: string) {
  return page.locator(`rect[data-cell="${id}"]`)
}

async function paintWithPadauk(page: Page, cellId: string): Promise<void> {
  await page.getByTestId('species-padauk').click()
  await cell(page, cellId).click()
  await expect(page.getByTestId('fork-dialog')).toBeVisible()
  await page.getByTestId('fork-confirm').click()
  await expect(page.getByTestId('fork-dialog')).toBeHidden()
}

test('покраска ячейки меняет её цвет', async ({ page }) => {
  await openStudio(page)
  const target = cell(page, 'r0:0')
  const before = await target.getAttribute('fill')
  expect(before).not.toBe('#a8422a')

  await paintWithPadauk(page, 'r0:0')

  await expect(cell(page, 'r0:0')).toHaveAttribute('fill', '#a8422a')
  // Соседний ряд на той же панели остаётся прежним: разветвление тронуло только этот ряд.
  await expect(cell(page, 'r2:0')).toHaveAttribute('fill', before ?? '')
})

test('смена толщины доски пересчитывает счётчик сложности', async ({ page }) => {
  await openStudio(page)
  const meterSize = page.getByText(/Габарит:/)
  await expect(meterSize).toContainText('толщина 40 мм')

  const thickness = page.getByTestId('board-thickness')
  await thickness.fill('60')
  await thickness.blur()

  await expect(meterSize).toContainText('толщина 60 мм')

  // Единицы влияют на всё разом: тот же счётчик переходит в дюймы.
  await page.getByTestId('unit-in').click()
  await expect(page.getByText(/Габарит:/)).toContainText('2.36"')
})

test('толщина доски переживает перезагрузку страницы', async ({ page }) => {
  // openStudio вешает clear-localStorage init-скрипт на каждую навигацию этой страницы,
  // а нам как раз нужно, чтобы после reload() хранилище осталось нетронутым.
  await page.goto('/?tab=editor')
  await page.evaluate(() => window.localStorage.clear())
  await page.reload()
  await expect(page.getByTestId('board-canvas')).toBeVisible()

  const thickness = page.getByTestId('board-thickness')
  await thickness.fill('60')
  await thickness.blur()

  // Ждём дебаунс автосохранения: значение должно долететь до localStorage.
  await page.waitForFunction(() => {
    const raw = window.localStorage.getItem('endgrain.current.v1')
    if (!raw) return false
    const parsed = JSON.parse(raw) as { b?: number[] }
    return parsed.b?.[2] === 60
  })

  await page.reload()
  await expect(page.getByTestId('board-canvas')).toBeVisible()
  await expect(page.getByTestId('board-thickness')).toHaveValue('60')
})

test('отмена возвращает покрашенную ячейку к прежней породе', async ({ page }) => {
  await openStudio(page)
  const before = await cell(page, 'r0:0').getAttribute('fill')

  await paintWithPadauk(page, 'r0:0')
  await expect(cell(page, 'r0:0')).toHaveAttribute('fill', '#a8422a')

  await page.getByTestId('undo').click()
  await expect(cell(page, 'r0:0')).toHaveAttribute('fill', before ?? '')

  await page.getByTestId('redo').click()
  await expect(cell(page, 'r0:0')).toHaveAttribute('fill', '#a8422a')
})
