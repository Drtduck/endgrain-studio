import { expect, test, type Page } from '@playwright/test'

async function openStudio(page: Page): Promise<void> {
  await page.addInitScript(() => window.localStorage.clear())
  await page.goto('/')
  await expect(page.getByTestId('board-canvas')).toBeVisible()
}

test('подсказка палитры открывается и закрывается', async ({ page }) => {
  await openStudio(page)
  await expect(page.getByTestId('help-content-palette')).toBeHidden()
  await page.getByTestId('help-palette').click()
  const content = page.getByTestId('help-content-palette')
  await expect(content).toBeVisible()
  await expect(content).toContainText('плотность')
  await page.keyboard.press('Escape')
  await expect(content).toBeHidden()
})

test('подсказка экспорта говорит про цех', async ({ page }) => {
  await openStudio(page)
  await page.getByTestId('help-export').click()
  await expect(page.getByTestId('help-content-export')).toContainText('в цех')
})
