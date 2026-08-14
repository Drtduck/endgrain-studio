import { expect, test } from '@playwright/test'
import { presetConsent } from './helpers/consent'

test.beforeEach(async ({ page }) => {
  await presetConsent(page)
})

/**
 * /account/api требует живую сессию: без Supabase (стандартный прогон CI, см. api.spec.ts)
 * страница сразу уводит на /login ещё до рендера, поэтому AppShell и мануал тут проверить
 * нечем. Тот же приём, что в auth.spec.ts - живой прогон только с E2E_AUTH=1 и настоящим
 * Supabase (переменные E2E_AUTH_EMAIL/E2E_AUTH_PASSWORD, живой пользователь).
 */
const enabled = process.env['E2E_AUTH'] === '1'

test.describe('страница API-ключей', () => {
  test.skip(!enabled, 'Требует живого Supabase: запускать локально с E2E_AUTH=1')

  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
    await page.getByTestId('auth-email').fill(process.env['E2E_AUTH_EMAIL'] ?? '')
    await page.getByTestId('auth-password').fill(process.env['E2E_AUTH_PASSWORD'] ?? '')
    await page.getByTestId('auth-submit').click()
    await expect(page.getByTestId('tab-projects')).toBeVisible({ timeout: 15_000 })
  })

  test('несёт AppShell (шапку и подвал) и панель ключей', async ({ page }) => {
    await page.goto('/account/api')
    await expect(page.getByTestId('app-shell-header')).toBeVisible()
    await expect(page.getByTestId('app-shell-footer')).toBeVisible()
    await expect(page.getByTestId('api-keys-panel')).toBeVisible()
  })

  test('мануал «Как пользоваться» свёрнут по умолчанию и раскрывается по клику', async ({ page }) => {
    await page.goto('/account/api')
    await expect(page.getByTestId('api-guide-body')).not.toBeVisible()

    await page.getByTestId('api-guide-toggle').click()
    await expect(page.getByTestId('api-guide-body')).toBeVisible()
    await expect(page.getByTestId('api-guide-curl-me')).toBeVisible()
    await expect(page.getByTestId('api-guide-mcp-connect')).toBeVisible()
    await expect(page.getByTestId('api-guide-mcp-tools')).toBeVisible()
  })

  test('студия под логином показывает ссылки на галерею и API', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('studio-nav-gallery')).toBeVisible()
    await expect(page.getByTestId('studio-nav-api')).toBeVisible()
  })
})
