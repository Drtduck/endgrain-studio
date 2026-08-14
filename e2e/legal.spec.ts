import { expect, test } from '@playwright/test'
import { presetConsent } from './helpers/consent'

test.beforeEach(async ({ page }) => {
  await presetConsent(page)
})

const PATHS = ['/legal/privacy', '/legal/personal-data', '/legal/consent']

for (const path of PATHS) {
  test(`${path} открывается анонимно и несёт заголовок, дату и секции`, async ({ page }) => {
    await page.goto(path)
    await expect(page.getByTestId('legal-title')).toBeVisible()
    await expect(page.getByTestId('legal-updated-at')).toBeVisible()
    const sections = page.getByTestId('legal-section')
    expect(await sections.count()).toBeGreaterThan(0)
  })

  test(`${path} несёт общую шапку и подвал app-домена (AppShell)`, async ({ page }) => {
    await page.goto(path)
    await expect(page.getByTestId('app-shell-header')).toBeVisible()
    await expect(page.getByTestId('app-shell-footer')).toBeVisible()
    await expect(page.getByTestId('app-shell-nav-studio')).toBeVisible()
  })
}

test('переключение eg-locale на en меняет заголовок', async ({ page }) => {
  await page.goto('/legal/privacy')
  const ruTitle = await page.getByTestId('legal-title').textContent()

  await page.context().addCookies([{ name: 'eg-locale', value: 'en', url: 'http://127.0.0.1:3100' }])
  await page.goto('/legal/privacy')
  const enTitle = await page.getByTestId('legal-title').textContent()

  expect(enTitle).not.toBe(ruTitle)
  expect(enTitle).toBe('Privacy Policy')
})

test('на /legal/privacy виден блок текущего выбора, переключатель меняет cookie', async ({ page }) => {
  await page.goto('/legal/privacy')
  await expect(page.getByTestId('consent-settings')).toBeVisible()
  const toggle = page.getByTestId('consent-settings-toggle')
  const before = await toggle.isChecked()
  await toggle.click()
  await expect(toggle).toBeChecked({ checked: !before })
  const cookies = await page.context().cookies()
  const consent = cookies.find((c) => c.name === 'eg-consent')
  expect(consent?.value).toContain('.settings.')
})
