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

  // Отправка: не фиксируем конкретный текст результата, потому что в CI Supabase
  // не настроен и ответ будет feedback.errorDisabled, а не успех.
  await page.getByTestId('feedback-submit').click()
  const result = page.getByTestId('feedback-sent').or(page.getByRole('alert'))
  await expect(result).toBeVisible()
})
