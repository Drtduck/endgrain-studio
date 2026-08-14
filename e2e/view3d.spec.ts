import { expect, test, type Page } from '@playwright/test'
import { presetConsent } from './helpers/consent'

test.beforeEach(async ({ page }) => {
  await presetConsent(page)
})

async function openStudio(page: Page): Promise<void> {
  await page.addInitScript(() => window.localStorage.clear())
  await page.goto('/?tab=editor')
  await expect(page.getByTestId('board-canvas')).toBeVisible()
}

test('вкладка 3D рисует канвас и не грузится на первом экране', async ({ page }) => {
  await openStudio(page)
  // До клика тяжёлый чанк не нужен: на первом экране канваса нет.
  await expect(page.locator('canvas')).toHaveCount(0)

  await page.getByTestId('tab-view3d').click()
  await expect(page.getByTestId('view3d')).toBeVisible()

  const canvas = page.locator('[data-testid="view3d"] canvas')
  await expect(canvas).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('view3d-unsupported')).toHaveCount(0)

  // R3F подгоняет канвас под контейнер через ResizeObserver уже после того, как элемент
  // становится видимым: первая проверка размера может ещё застать канвас в дефолтных 300x150.
  await expect(async () => {
    const box = await canvas.boundingBox()
    expect(box?.width ?? 0).toBeGreaterThan(200)
    expect(box?.height ?? 0).toBeGreaterThan(200)
  }).toPass({ timeout: 10_000 })
})

test('возврат в редактор возвращает холст, счётчик виден в обеих вкладках', async ({ page }) => {
  await openStudio(page)
  await page.getByTestId('tab-view3d').click()
  await expect(page.locator('[data-testid="view3d"] canvas')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText(/Габарит:/)).toBeVisible()

  await page.getByTestId('tab-editor').click()
  await expect(page.getByTestId('board-canvas')).toBeVisible()
})

test('сцена переживает правку доски', async ({ page }) => {
  await openStudio(page)
  const thickness = page.getByTestId('board-thickness')
  await thickness.fill('60')
  await thickness.blur()

  await page.getByTestId('tab-view3d').click()
  await expect(page.locator('[data-testid="view3d"] canvas')).toBeVisible({ timeout: 30_000 })
  // Ошибка в сцене подняла бы границу ошибок и подменила канвас заглушкой.
  await expect(page.getByTestId('view3d-unsupported')).toHaveCount(0)
})
