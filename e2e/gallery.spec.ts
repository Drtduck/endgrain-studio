import { expect, test } from '@playwright/test'

/**
 * CI поднимает студию с PUBLIC_STUDIO=1 и без ключей Supabase (см. playwright.config.ts).
 * Значит галерея тут всегда в состоянии деградации: страница обязана открываться
 * анониму и честно показывать пустое состояние, а не 500 и не редирект на логин.
 * Живой сценарий «публикация -> лайк -> копия» гоняется руками на проде с ключами
 * (см. тест-план в спеке), автоматически тут не покрыт из-за отсутствия Supabase в CI.
 */

test('галерея открывается анонимом без редиректа на логин', async ({ page }) => {
  const response = await page.goto('/gallery')
  expect(response?.status()).toBeLessThan(400)
  await expect(page).toHaveURL(/\/gallery/)
})

test('без Supabase галерея честно показывает пустое состояние', async ({ page }) => {
  await page.goto('/gallery')
  await expect(page.getByTestId('gallery-empty')).toBeVisible()
})

test('переключатель сортировки меняет ссылку и URL', async ({ page }) => {
  await page.goto('/gallery')
  await page.getByTestId('gallery-sort-popular').click()
  await expect(page).toHaveURL(/sort=popular/)
  await expect(page.getByTestId('gallery-empty')).toBeVisible()
})

test('несуществующая публикация отдаёт 404', async ({ page }) => {
  const response = await page.goto('/gallery/00000000-0000-0000-0000-000000000000')
  expect(response?.status()).toBe(404)
})
