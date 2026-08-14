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

test('в шапке остались только разделы: тарифы, профиль и ключи ушли под аватар', async ({ page }) => {
  await presetConsent(page)
  await page.goto('/')

  const header = page.getByTestId('app-header')
  await expect(header.getByTestId('app-shell-nav-gallery')).toBeVisible()
  await expect(header.getByTestId('app-blog-link')).toBeVisible()
  await expect(header.getByTestId('app-shell-nav-pricing')).toHaveCount(0)
  await expect(header.getByTestId('studio-nav-account')).toHaveCount(0)
  await expect(header.getByTestId('app-shell-nav-api')).toHaveCount(0)
})

/** Порядок в шапке студии: разделы левее переключателя мер, а не за ним. */
test('галерея и блог стоят левее переключателя мм/дюймы', async ({ page }) => {
  await presetConsent(page)
  await page.goto('/')

  const order = await page.evaluate(() => {
    const at = (id: string) =>
      Array.from(document.querySelectorAll('[data-testid]')).findIndex(
        (el) => el.getAttribute('data-testid') === id,
      )
    return { gallery: at('app-shell-nav-gallery'), blog: at('app-blog-link'), unit: at('unit-mm') }
  })

  expect(order.gallery).toBeGreaterThan(-1)
  expect(order.blog).toBeGreaterThan(order.gallery)
  expect(order.unit).toBeGreaterThan(order.blog)
})

/**
 * Раньше клик по пункту меню несколько секунд не давал никакой реакции: RSC-навигация
 * молча ждала сервер. Теперь на клик зажигается полоска NavProgress. Ответ маршрута
 * тут искусственно замедлен, иначе на локальной сборке переход укладывается в кадр.
 */
test('клик по разделу сразу зажигает полоску перехода', async ({ page }) => {
  await presetConsent(page)
  await page.goto('/')

  await page.route('**/gallery?*', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 2000))
    await route.continue()
  })

  const bar = page.getByTestId('nav-progress')
  await expect(bar).toHaveAttribute('data-active', 'false')

  await page.getByTestId('app-shell-nav-gallery').click()
  await expect(bar).toHaveAttribute('data-active', 'true', { timeout: 2000 })
  await expect(page).toHaveURL(/\/gallery/, { timeout: 15_000 })
  await expect(page.getByTestId('nav-progress')).toHaveAttribute('data-active', 'false', { timeout: 5000 })
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
