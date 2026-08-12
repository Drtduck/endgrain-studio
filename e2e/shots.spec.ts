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

test.describe('скриншоты лендинга', () => {
  for (const view of VIEWS) {
    test(`снимок вкладки ${view.tab}`, async ({ page }) => {
      await page.goto('/')
      await page.getByTestId(`tab-${view.tab}`).click()
      await expect(page.getByTestId(view.marker)).toBeVisible()
      await page.screenshot({ path: `public/landing/shots/${view.file}` })
    })
  }
})
