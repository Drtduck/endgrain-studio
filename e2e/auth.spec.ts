import { expect, test } from '@playwright/test'

const enabled = process.env['E2E_AUTH'] === '1'

test.describe('аккаунт', () => {
  test.skip(!enabled, 'Требует живого Supabase: запускать локально с E2E_AUTH=1')

  test('регистрация нового пользователя и выход', async ({ page }) => {
    const email = `endgrain+${Date.now()}@example.com`
    await page.goto('/register')
    await page.getByTestId('auth-email').fill(email)
    await page.getByTestId('auth-password').fill('очень-длинный-пароль-1')
    await page.getByTestId('auth-submit').click()
    // Либо сразу в студию (подтверждение почты выключено), либо экран «письмо отправлено».
    await expect(
      page.getByTestId('account-email').or(page.getByTestId('auth-confirm-sent')),
    ).toBeVisible({ timeout: 15_000 })
  })

  test('вход существующим пользователем открывает вкладку проектов', async ({ page }) => {
    await page.goto('/login')
    await page.getByTestId('auth-email').fill(process.env['E2E_AUTH_EMAIL'] ?? '')
    await page.getByTestId('auth-password').fill(process.env['E2E_AUTH_PASSWORD'] ?? '')
    await page.getByTestId('auth-submit').click()
    await expect(page.getByTestId('tab-projects')).toBeVisible({ timeout: 15_000 })
    await page.getByTestId('tab-projects').click()
    await page.getByTestId('projects-save').click()
    await expect(page.getByTestId('projects-error')).toBeHidden()
  })
})
