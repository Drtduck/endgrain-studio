import { expect, test } from '@playwright/test'
import { presetConsent } from './helpers/consent'

/**
 * Владелец жаловался, что в разных разделах приложения шапка разная: на странице
 * ключей API вместо неё стояла маленькая ссылка «Endgrain App». Теперь все
 * страницы приложения рисуют один компонент AppHeader, и этот спек держит
 * договорённость: бренд со ссылкой на главную, язык и профиль есть везде.
 */

/** Публичные в CI маршруты приложения: PUBLIC_STUDIO=1, Supabase не настроен. */
const ROUTES = ['/', '/gallery', '/pricing', '/legal/privacy', '/legal/personal-data', '/legal/consent']

for (const route of ROUTES) {
  test(`шапка приложения одинакова: ${route}`, async ({ page }) => {
    await presetConsent(page)
    await page.goto(route)

    const header = page.getByTestId('app-header')
    await expect(header).toBeVisible()
    await expect(header.getByTestId('app-header-home')).toHaveAttribute('href', '/')
    await expect(header.getByTestId('locale-ru')).toBeVisible()
    await expect(header.getByTestId('locale-en')).toBeVisible()
  })
}

test('вкладки и единицы живут только в студии', async ({ page }) => {
  await presetConsent(page)

  await page.goto('/')
  await expect(page.getByTestId('unit-mm')).toBeVisible()
  await expect(page.getByTestId('tab-editor')).toBeVisible()

  await page.goto('/pricing')
  await expect(page.getByTestId('app-header')).toBeVisible()
  await expect(page.getByTestId('unit-mm')).toHaveCount(0)
  await expect(page.getByTestId('tab-editor')).toHaveCount(0)
})

/**
 * Страницы входа, регистрации и сброса пароля намеренно остаются без общей
 * шапки: там центрированная карточка AuthCard со своим логотипом (AuthHeader),
 * который тоже ведёт на главную. Меню профиля и вкладки студии человеку без
 * сессии показывать нечего.
 */
for (const route of ['/login', '/register', '/forgot-password']) {
  test(`страница авторизации остаётся карточкой: ${route}`, async ({ page }) => {
    await presetConsent(page)
    await page.goto(route)
    await expect(page.getByTestId('auth-card')).toBeVisible()
    await expect(page.getByTestId('app-header')).toHaveCount(0)
    await expect(page.getByTestId('auth-home')).toHaveAttribute('href', '/')
  })
}
