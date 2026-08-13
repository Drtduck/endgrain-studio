import { expect, test, type Page } from '@playwright/test'
import { presetConsent } from './helpers/consent'

test.beforeEach(async ({ page }) => {
  await presetConsent(page)
})

async function openStudio(page: Page): Promise<void> {
  await page.addInitScript(() => window.localStorage.clear())
  await page.goto('/')
  await expect(page.getByTestId('board-canvas')).toBeVisible()
}

const DESKTOP = { width: 1280, height: 900 }
const MOBILE = { width: 375, height: 812 }

const TABS: readonly { readonly tab: string; readonly marker: string }[] = [
  { tab: 'editor', marker: 'board-canvas' },
  { tab: 'templates', marker: 'template-gallery' },
  { tab: 'generate', marker: 'generator-panel' },
  { tab: 'photo', marker: 'photo-panel' },
  { tab: 'view3d', marker: 'view3d' },
  { tab: 'books', marker: 'literature-section' },
]

for (const { tab, marker } of TABS) {
  test(`визуальный смоук вкладки ${tab}`, async ({ page }) => {
    await openStudio(page)
    await page.getByTestId(`tab-${tab}`).click()
    await expect(page.getByTestId(marker)).toBeVisible()
    // Переключение вкладки анимируется кросс-фейдом (~200ms); скриншот, снятый сразу
    // после клика, ловит промежуточный кадр перехода.
    await page.waitForTimeout(250)

    if (tab === 'view3d') {
      // R3F подгоняет канвас под контейнер через ResizeObserver уже после того, как
      // элемент становится видимым: скриншот без ожидания поймает канвас 300x150.
      const canvas = page.locator('[data-testid="view3d"] canvas')
      await expect(canvas).toBeVisible({ timeout: 30_000 })
      await expect(async () => {
        const box = await canvas.boundingBox()
        expect(box?.width ?? 0).toBeGreaterThan(200)
        expect(box?.height ?? 0).toBeGreaterThan(200)
      }).toPass({ timeout: 10_000 })
    }

    await page.evaluate(() => document.fonts.ready)
    // fullPage:true падает с "Unable to capture screenshot" на вкладке editor - страница с
    // SVG-доской высокая (~9000px), и стежка полноразмерного скриншота у Chromium иногда рвётся.
    // Снимаем через clip по scrollHeight - тот же результат, без хрупкости стежки.
    await page.setViewportSize(DESKTOP)
    const desktopScroll = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
    }))
    expect(desktopScroll.width).toBeLessThanOrEqual(DESKTOP.width + 1)
    await page.screenshot({
      path: `test-results/visual/${tab}-1280.png`,
      clip: { x: 0, y: 0, width: DESKTOP.width, height: desktopScroll.height },
    })

    await page.setViewportSize(MOBILE)
    await expect(page.getByTestId(marker)).toBeVisible()
    const mobileHeight = await page.evaluate(() => document.documentElement.scrollHeight)
    await page.screenshot({
      path: `test-results/visual/${tab}-375.png`,
      clip: { x: 0, y: 0, width: MOBILE.width, height: mobileHeight },
    })

    const noHorizontalScroll = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    )
    expect(noHorizontalScroll).toBe(true)
  })
}

test('визуальный кадр углового шаблона (шеврон)', async ({ page }) => {
  await openStudio(page)
  await page.getByTestId('tab-templates').click()
  await expect(page.getByTestId('template-gallery')).toBeVisible()
  await page.getByTestId('template-chevron-classic').click()
  await expect(page.getByTestId('board-canvas')).toBeVisible()
  // Угловая ячейка рисуется полигоном - кадр ловит регресс, если превью тихо откатится
  // на прямоугольники (см. components/BoardSvg.tsx).
  await expect(page.locator('[data-testid="board-canvas"] polygon[data-cell]').first()).toBeVisible()

  await page.evaluate(() => document.fonts.ready)
  await page.setViewportSize(DESKTOP)
  const scroll = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
  }))
  await page.screenshot({
    path: 'test-results/visual/angled-chevron-1280.png',
    clip: { x: 0, y: 0, width: DESKTOP.width, height: scroll.height },
  })
})

test('вычисленные стили: токены дизайн-системы применены', async ({ page }) => {
  await openStudio(page)
  await page.evaluate(() => document.fonts.ready)

  const header = page.getByTestId('app-header')
  await expect(header).toHaveCSS('min-height', '56px')
  await expect(header).toHaveCSS('background-color', 'rgb(251, 249, 245)')

  const activeTab = page.getByTestId('tab-editor')
  await expect(activeTab).toHaveCSS('background-color', 'rgb(220, 234, 231)')
  await expect(activeTab).toHaveCSS('color', 'rgb(20, 97, 90)')

  const inactiveTab = page.getByTestId('tab-photo')
  const inactiveBg = await inactiveTab.evaluate((el) => getComputedStyle(el).backgroundColor)
  expect(inactiveBg).not.toBe('rgb(220, 234, 231)')

  // Контейнер холста - секция с bg-canvas, на два уровня выше data-testid="board-canvas".
  const canvasSection = page.locator('section:has([data-testid="board-canvas"])')
  await expect(canvasSection).toHaveCSS('background-color', 'rgb(233, 227, 216)')

  const caption = page.getByTestId('board-caption')
  const captionFontFamily = await caption.evaluate((el) => getComputedStyle(el).fontFamily)
  expect(captionFontFamily).toContain('JetBrains')
  const captionVariant = await caption.evaluate((el) => getComputedStyle(el).fontVariantNumeric)
  expect(captionVariant).toContain('tabular-nums')

  await expect(page.getByTestId('board-thickness')).toHaveCSS('font-family', /JetBrains/)

  const bodyFontFamily = await page.evaluate(() => getComputedStyle(document.body).fontFamily)
  expect(bodyFontFamily).toContain('Golos')

  const headerTitleFontFamily = await header
    .getByText('Endgrain Studio', { exact: true })
    .evaluate((el) => getComputedStyle(el).fontFamily)
  expect(headerTitleFontFamily).toContain('Bitter')
})
