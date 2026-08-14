import { expect, test } from '@playwright/test'
import { presetConsent } from './helpers/consent'

test.beforeEach(async ({ page }) => {
  await presetConsent(page)
})

// Требует живого Supabase (см. README, раздел "Переменные окружения"). После прогона
// с E2E_AUTH=1 удалите тестового пользователя, созданного сценарием регистрации,
// из auth.users в панели Supabase или через SQL - иначе прод-таблица засоряется.
const enabled = process.env['E2E_AUTH'] === '1'

test.describe('аккаунт', () => {
  test.skip(!enabled, 'Требует живого Supabase: запускать локально с E2E_AUTH=1')

  test('регистрация нового пользователя и выход', async ({ page }) => {
    const email = `endgrain+${Date.now()}@example.com`
    await page.goto('/register')
    await page.getByTestId('auth-email').fill(email)
    await page.getByTestId('auth-password').fill('очень-длинный-пароль-1')
    await page.getByTestId('auth-consent').check()
    await page.getByTestId('auth-submit').click()
    // Либо сразу в студию (подтверждение почты выключено), либо экран «письмо отправлено».
    await expect(
      page.getByTestId('account-email').or(page.getByTestId('auth-confirm-sent')),
    ).toBeVisible({ timeout: 15_000 })
  })

  test('вход через окно на лендинге доводит до студии', async ({ page }) => {
    // Боевые домены не нужны: на локальном хосте appOriginForClient() отдаёт текущий origin,
    // а домен auth-cookie считается от того же хоста, поэтому cookie остаётся host-only
    // и сессия из модалки видна студии на том же адресе.
    await page.goto('/landing')
    await page.getByTestId('landing-cta-hero').click()
    await expect(page.getByTestId('landing-auth-dialog')).toBeVisible()
    await page.getByTestId('landing-auth-switch').click()
    await page.getByTestId('auth-email').fill(process.env['E2E_AUTH_EMAIL'] ?? '')
    await page.getByTestId('auth-password').fill(process.env['E2E_AUTH_PASSWORD'] ?? '')
    await page.getByTestId('auth-submit').click()
    await expect(page.getByTestId('tab-projects')).toBeVisible({ timeout: 15_000 })
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

  test('после входа назад не возвращает форму логина', async ({ page }) => {
    await page.goto('/pricing')
    await page.goto('/login')
    await page.getByTestId('auth-email').fill(process.env['E2E_AUTH_EMAIL'] ?? '')
    await page.getByTestId('auth-password').fill(process.env['E2E_AUTH_PASSWORD'] ?? '')
    await page.getByTestId('auth-submit').click()
    await expect(page.getByTestId('tab-projects')).toBeVisible({ timeout: 15_000 })

    await page.goBack()
    await expect(page).toHaveURL(/\/pricing/)
    await expect(page.getByTestId('auth-form-login')).toHaveCount(0)

    // Форма логина заменена в истории, а не переиспользована, поэтому и прямой
    // заход на неё уже авторизованного человека тоже не должен возвращать.
    await page.goto('/login')
    await expect(page.getByTestId('tab-projects')).toBeVisible({ timeout: 15_000 })
  })
})

// Гейт студии проверяется только на сборке без аварийного флага: playwright.config.ts
// по умолчанию поднимает сервер с PUBLIC_STUDIO=1, иначе анонимные смоки не откроют
// редактор. Запуск: PUBLIC_STUDIO=0 pnpm test:e2e e2e/auth.spec.ts
const gateEnabled = process.env['PUBLIC_STUDIO'] === '0'

test.describe('гейт студии', () => {
  test.skip(!gateEnabled, 'Требует сборки с PUBLIC_STUDIO=0')

  test('аноним с корня улетает на логин, next сохраняет путь', async ({ page }) => {
    await page.goto('/?tab=cut')
    await expect(page).toHaveURL(/\/login\?next=/)
    await expect(page.getByTestId('auth-form-login')).toBeVisible()
  })

  test('страницы входа и прайс открыты без аккаунта', async ({ page }) => {
    await page.goto('/register')
    await expect(page.getByTestId('auth-form-register')).toBeVisible()
    await page.goto('/pricing')
    await expect(page).toHaveURL(/\/pricing/)
  })
})
