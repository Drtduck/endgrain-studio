import { expect, test } from '@playwright/test'

test('форма подписки валидирует адрес и честно сообщает, что почта не подключена', async ({ page }) => {
  await page.goto('/landing')
  await page.getByTestId('subscribe-email').fill('не-почта')
  await page.getByTestId('subscribe-submit').click()
  await expect(page.getByTestId('subscribe-error')).toBeVisible()

  await page.getByTestId('subscribe-email').fill('stas@example.com')
  await page.getByTestId('subscribe-submit').click()
  // В CI переменных Resend нет, экшен обязан ответить честной заглушкой,
  // а не молча притвориться успехом. Локально, если разработчик уже прописал
  // .env.local, Resend отбивает домен example.com как невалидный и вернёт
  // failed, а не disabled, поэтому ждём любой из двух честных ответов.
  await expect(page.getByTestId('subscribe-error')).toContainText(/пока не подключена|Не получилось отправить/)
})
