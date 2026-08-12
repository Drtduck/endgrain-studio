import { expect, test, type Page } from '@playwright/test'

async function openStudio(page: Page): Promise<void> {
  await page.addInitScript(() => window.localStorage.clear())
  await page.goto('/')
  await expect(page.getByTestId('board-canvas')).toBeVisible()
}

test('полка инструментов сворачивается и несёт дисклеймер', async ({ page }) => {
  await openStudio(page)
  const shelf = page.getByTestId('affiliate-shelf')
  await expect(shelf).toBeVisible()
  await expect(page.getByTestId('affiliate-disclosure')).toBeHidden()
  await shelf.getByRole('button').or(shelf.locator('summary')).first().click()
  await expect(page.getByTestId('affiliate-disclosure')).toContainText('Amazon')
})

test('вкладка литературы показывает восемь книг с партнёрскими ссылками', async ({ page }) => {
  await openStudio(page)
  await page.getByTestId('tab-books').click()
  await expect(page.getByTestId('literature-section')).toBeVisible()
  const links = page.getByTestId('literature-section').getByRole('link')
  await expect(links).toHaveCount(8)
  await expect(links.first()).toHaveAttribute('rel', /sponsored/)
  await expect(links.first()).toHaveAttribute('href', /amazon\.com/)
})
