import { expect, test } from '@playwright/test'

// Съёмка скриншотов для полосы лендинга. Не гоняется в CI и не влияет на 43 существующих
// e2e: тот же приём, что уже применён к e2e/auth.spec.ts с E2E_AUTH.
const enabled = process.env['SHOTS'] === '1'
test.skip(!enabled, 'Съёмка скриншотов лендинга: pnpm shots')

const VIEWS = [
  { tab: 'editor', marker: 'board-canvas', file: 'editor.png' },
  { tab: 'templates', marker: 'template-gallery', file: 'templates.png' },
  { tab: 'generate', marker: 'generator-panel', file: 'generator.png' },
  { tab: 'photo', marker: 'photo-panel', file: 'photo.png' },
  { tab: 'view3d', marker: 'view3d', file: 'view3d.png' },
] as const

// Комплект снимается на каждую локаль: английский лендинг обязан показывать английский
// интерфейс, поэтому файлы лежат в папках по локали и ShotStrip выбирает папку сам.
const LOCALES = ['ru', 'en'] as const

test.describe('скриншоты лендинга', () => {
  for (const locale of LOCALES) {
  for (const view of VIEWS) {
    test(`снимок вкладки ${view.tab} (${locale})`, async ({ page }) => {
      await page.goto('/')
      if (locale !== 'ru') {
        // Язык студии живёт в zustand-сторе, переключается той же кнопкой, что и у пользователя.
        await page.getByTestId(`locale-${locale}`).click()
      }
      await page.getByTestId(`tab-${view.tab}`).click()
      await expect(page.getByTestId(view.marker)).toBeVisible()

      if (view.tab === 'view3d') {
        // R3F грузится динамически (см. Board3DPanel.tsx): пока идёт lazy-import сцены,
        // на месте канваса стоит скелет с надписью "Собираем сцену". Снимок без ожидания
        // канваса ловит именно лоадер, а не готовую 3D-доску.
        const canvas = page.locator('[data-testid="view3d"] canvas')
        await expect(canvas).toBeVisible({ timeout: 30_000 })
        await expect(async () => {
          const box = await canvas.boundingBox()
          expect(box?.width ?? 0).toBeGreaterThan(200)
          expect(box?.height ?? 0).toBeGreaterThan(200)
        }).toPass({ timeout: 10_000 })
      }

      await page.evaluate(() => document.fonts.ready)
      await page.screenshot({ path: `public/landing/shots/${locale}/${view.file}` })
    })
  }
  }
})
