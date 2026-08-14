import { expect, test } from '@playwright/test'
import { presetConsent } from './helpers/consent'

/**
 * CI поднимает студию с PUBLIC_STUDIO=1 и без ключей Supabase (см. playwright.config.ts,
 * тот же приём, что в gallery.spec.ts и api-keys-ui.spec.ts). Без Supabase getCurrentUser()
 * в app/account/page.tsx честно возвращает null, поэтому страница сама уводит на /login -
 * ровно то же второй-слой поведение, что у /account/api. Публичный /u/[id] без Supabase
 * не находит ни профиля, ни работ автора и отдаёт 404 (сессии в CI тоже нет,
 * поэтому владельцем чужого id никто не окажется). Живой сценарий (заполнение профиля,
 * смена почты/пароля, публичная карточка автора) гоняется руками на проде с ключами
 * (E2E_AUTH=1, см. api-keys-ui.spec.ts).
 */

test.beforeEach(async ({ page }) => {
  await presetConsent(page)
})

test('/account без пользователя уводит на /login', async ({ page }) => {
  await page.goto('/account')
  await expect(page).toHaveURL(/\/login/)
  await expect(page).toHaveURL(/next=%2Faccount/)
})

test('/u/[id] анониму на пустого автора отдаёт 404', async ({ page }) => {
  const response = await page.goto('/u/00000000-0000-0000-0000-000000000000')
  expect(response?.status()).toBe(404)
})

const enabled = process.env['E2E_AUTH'] === '1'

test.describe('страница профиля с живым Supabase', () => {
  test.skip(!enabled, 'Требует живого Supabase: запускать локально с E2E_AUTH=1')

  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
    await page.getByTestId('auth-email').fill(process.env['E2E_AUTH_EMAIL'] ?? '')
    await page.getByTestId('auth-password').fill(process.env['E2E_AUTH_PASSWORD'] ?? '')
    await page.getByTestId('auth-submit').click()
    await expect(page.getByTestId('tab-projects')).toBeVisible({ timeout: 15_000 })
  })

  test('несёт единый AppHeader и все секции формы', async ({ page }) => {
    await page.goto('/account')
    // Ровно один: AccountLayout оборачивает страницу в AppShell (свой AppHeader),
    // а страница раньше рисовала AppHeader ещё раз поверх него - регрессия
    // hotfix/account-save на две шапки на /account.
    await expect(page.getByTestId('app-header')).toHaveCount(1)
    await expect(page.getByTestId('app-header')).toBeVisible()
    await expect(page.getByTestId('profile-form')).toBeVisible()
    await expect(page.getByTestId('email-section')).toBeVisible()
    await expect(page.getByTestId('password-section')).toBeVisible()
    await expect(page.getByTestId('danger-zone')).toBeVisible()
  })

  test('сохранение публичного профиля показывает подтверждение и ссылку «как меня видят»', async ({ page }) => {
    await page.goto('/account')
    await page.getByTestId('profile-display-name').fill('Тестовый мастер')
    await page.getByTestId('profile-save').click()
    await expect(page.getByTestId('profile-saved')).toBeVisible()
    await expect(page.getByTestId('profile-view-public')).toHaveAttribute('href', /^\/u\//)
  })

  test('«Как меня видят» открывает свою страницу, а не 404 (даже без публикаций)', async ({ page }) => {
    await page.goto('/account')
    const href = await page.getByTestId('profile-view-public').getAttribute('href')
    expect(href).toMatch(/^\/u\//)
    const response = await page.goto(href ?? '/u/none')
    expect(response?.status()).toBe(200)
    await expect(page.getByTestId('public-profile-name')).toBeVisible()
  })

  test('иконка профиля: выбор картинки виден, пустой профиль показывает инициал', async ({ page }) => {
    await page.goto('/account')
    await expect(page.getByTestId('avatar-picker')).toBeVisible()
    await expect(page.getByTestId('avatar-upload')).toBeVisible()
    // Кнопка «Убрать» появляется только когда картинка уже загружена.
    const removeCount = await page.getByTestId('avatar-remove').count()
    const kind = await page.getByTestId('avatar-picker').getByTestId('avatar').getAttribute('data-avatar-kind')
    expect(removeCount === 0 ? kind : 'image').toBe(removeCount === 0 ? 'initial' : 'image')
  })

  test('опасная зона требует ввод своей почты, кнопка удаления неактивна до совпадения', async ({ page }) => {
    await page.goto('/account')
    await page.getByTestId('danger-open').click()
    await expect(page.getByTestId('danger-confirm-dialog')).toBeVisible()
    await expect(page.getByTestId('danger-confirm')).toBeDisabled()
    await page.getByTestId('danger-confirm-email').fill('не-моя-почта@example.com')
    await expect(page.getByTestId('danger-confirm')).toBeDisabled()
    await page.getByTestId('danger-cancel').click()
    await expect(page.getByTestId('danger-confirm-dialog')).not.toBeVisible()
  })

  test('профиль открывается из меню аватара, отдельной ссылки в шапке нет', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('studio-nav-account')).toHaveCount(0)
    await page.getByTestId('account-menu-trigger').click()
    await page.getByTestId('account-menu-profile').click()
    await expect(page).toHaveURL(/\/account$/)
  })
})
