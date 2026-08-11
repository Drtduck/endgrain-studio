import { expect, test, type Page } from '@playwright/test'

async function openStudio(page: Page): Promise<void> {
  await page.addInitScript(() => window.localStorage.clear())
  await page.goto('/')
  await expect(page.getByTestId('board-canvas')).toBeVisible()
}

test('выбор шаблона меняет доску', async ({ page }) => {
  await openStudio(page)
  await page.getByTestId('tab-templates').click()
  await expect(page.getByTestId('template-gallery')).toBeVisible()

  await page.getByTestId('template-chess-8x8').click()

  // Шаблон применён: мы снова в редакторе, а угловая ячейка стала бортиком из вишни.
  await expect(page.getByTestId('board-canvas')).toBeVisible()
  await expect(page.locator('rect[data-cell="r0:0"]')).toHaveAttribute('fill', '#a5613b')
  await expect(page.getByText(/Габарит: 296/)).toBeVisible()
})

test('шаблон поверх правок сначала спрашивает', async ({ page }) => {
  await openStudio(page)
  const thickness = page.getByTestId('board-thickness')
  await thickness.fill('60')
  await thickness.blur()

  await page.getByTestId('tab-templates').click()
  await page.getByTestId('template-stripes-wide').click()
  await expect(page.getByTestId('template-confirm-dialog')).toBeVisible()

  await page.getByTestId('template-cancel').click()
  await expect(page.getByTestId('template-confirm-dialog')).toBeHidden()

  await page.getByTestId('template-stripes-wide').click()
  await page.getByTestId('template-confirm').click()
  await expect(page.getByTestId('board-canvas')).toBeVisible()
  await expect(page.locator('rect[data-cell="r0:0"]')).toHaveAttribute('fill', '#e3caa1')
})

test('шаблон переживает перезагрузку страницы', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => window.localStorage.clear())
  await page.reload()
  await expect(page.getByTestId('board-canvas')).toBeVisible()

  await page.getByTestId('tab-templates').click()
  await page.getByTestId('template-pinstripe').click()
  await expect(page.getByTestId('board-canvas')).toBeVisible()

  await page.waitForFunction(() => window.localStorage.getItem('endgrain.current.v1') !== null)
  await page.reload()
  await expect(page.locator('rect[data-cell="r0:1"]')).toHaveAttribute('fill', '#3a2a20')
})
