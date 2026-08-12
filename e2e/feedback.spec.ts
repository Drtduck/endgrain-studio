import { expect, test, type Page } from '@playwright/test'

async function openStudio(page: Page): Promise<void> {
  await page.addInitScript(() => window.localStorage.clear())
  await page.goto('/')
  await expect(page.getByTestId('board-canvas')).toBeVisible()
}

test('попап обратной связи открывается и валидирует пустой текст', async ({ page }) => {
  await openStudio(page)
  await page.getByTestId('feedback-button').click()
  await expect(page.getByTestId('feedback-text')).toBeVisible()
  await expect(page.getByTestId('feedback-submit')).toBeDisabled()
  await page.getByTestId('feedback-text').fill('не хватает бука в палитре')
  await expect(page.getByTestId('feedback-counter')).toContainText('25')
  await expect(page.getByTestId('feedback-submit')).toBeEnabled()
  // Клик по отправке сознательно не делаем: локально .env.local настоящий, и клик
  // ушёл бы настоящей строкой в прод-таблицу обратной связи. Достаточно проверить
  // попап, валидацию пустого текста и счётчик - это и делает CI на каждом прогоне.
})
