import { expect, test, type Page } from '@playwright/test'
import { presetConsent } from './helpers/consent'

test.beforeEach(async ({ page }) => {
  await presetConsent(page)
})

async function openStudio(page: Page): Promise<void> {
  await page.addInitScript(() => window.localStorage.clear())
  await page.goto('/')
  await expect(page.getByTestId('home-view')).toBeVisible()
}

test('клик по вкладке пишет ?tab= в адресную строку', async ({ page }) => {
  await openStudio(page)
  await expect(page).toHaveURL(/^[^?]*\/?$/)

  await page.getByTestId('tab-templates').click()
  await expect(page.getByTestId('template-gallery')).toBeVisible()
  await expect(page).toHaveURL(/[?&]tab=templates(&|$)/)

  await page.getByTestId('tab-view3d').click()
  await expect(page.getByTestId('view3d')).toBeVisible()
  await expect(page).toHaveURL(/[?&]tab=view3d(&|$)/)

  await page.getByTestId('tab-editor').click()
  await expect(page.getByTestId('board-canvas')).toBeVisible()
  await expect(page).toHaveURL(/[?&]tab=editor(&|$)/)

  // Главная - вкладка по умолчанию, ?tab= в адресной строке для неё не нужен.
  await page.getByTestId('tab-home').click()
  await expect(page.getByTestId('home-view')).toBeVisible()
  await expect(page).not.toHaveURL(/tab=/)
})

test('прямой заход по ссылке с ?tab= открывает нужную вкладку', async ({ page }) => {
  await page.addInitScript(() => window.localStorage.clear())
  await page.goto('/?tab=templates')
  await expect(page.getByTestId('template-gallery')).toBeVisible()
  await expect(page.getByTestId('tab-templates')).toHaveAttribute('aria-selected', 'true')
})

test('неизвестное значение ?tab= откатывает на главную', async ({ page }) => {
  await page.addInitScript(() => window.localStorage.clear())
  await page.goto('/?tab=nonsense')
  await expect(page.getByTestId('home-view')).toBeVisible()
  await expect(page).not.toHaveURL(/tab=/)
})

test('кнопка «назад» восстанавливает вкладку из истории', async ({ page }) => {
  // Клики по вкладкам внутри студии зовут router.replace (иначе каждая вкладка
  // засоряла бы историю и «назад» никогда не уводил со студии), поэтому «назад»
  // проверяем через переход по прямым ссылкам - именно так появляются записи истории.
  await page.addInitScript(() => window.localStorage.clear())
  await page.goto('/')
  await expect(page.getByTestId('home-view')).toBeVisible()

  await page.goto('/?tab=templates')
  await expect(page.getByTestId('template-gallery')).toBeVisible()

  await page.goBack()
  await expect(page.getByTestId('home-view')).toBeVisible()
  await expect(page).not.toHaveURL(/tab=/)
})
