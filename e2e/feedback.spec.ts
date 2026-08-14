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

test('вложение прикрепляется и убирается, если облако подключено', async ({ page }) => {
  await openStudio(page)
  await page.getByTestId('feedback-button').click()
  await expect(page.getByTestId('feedback-text')).toBeVisible()

  // Без переменных Supabase вложений нет по дизайну: в таком прогоне кнопки
  // прикрепления не существует, и тест честно помечается пропущенным, а не
  // притворяется пройденным.
  test.skip(
    (await page.getByTestId('feedback-attach').count()) === 0,
    'NEXT_PUBLIC_SUPABASE_* не заданы, вложения выключены гейтом',
  )

  await page.getByTestId('feedback-file-input').setInputFiles({
    name: 'схема.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    ),
  })

  await expect(page.getByTestId('feedback-attachment')).toContainText('схема.png')
  await page.getByTestId('feedback-attach-remove').click()
  await expect(page.getByTestId('feedback-attachment')).toHaveCount(0)
  await expect(page.getByTestId('feedback-attach')).toBeVisible()
})
