// Разовый скрипт для конкурсной заявки: записывает демо-ролик по студии Endgrain.
// Требует уже запущенный прод-билд на PORT (см. package.json -> pnpm build && pnpm start).
// Запуск: PORT=3100 node scripts/demo-record.mjs
import { chromium } from '@playwright/test'
import { mkdir, readdir, rename } from 'node:fs/promises'
import path from 'node:path'

const PORT = process.env.PORT ?? '3100'
const BASE_URL = `http://127.0.0.1:${PORT}`
const OUT_DIR = path.resolve(import.meta.dirname, '../docs/submission')
const VIDEO_DIR = path.resolve(OUT_DIR, '_video-tmp')

async function main() {
  await mkdir(VIDEO_DIR, { recursive: true })
  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  })
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    recordVideo: { dir: VIDEO_DIR, size: { width: 1280, height: 900 } },
  })
  const page = await context.newPage()

  const pause = (ms) => new Promise((r) => setTimeout(r, ms))
  const click = async (testId, opts) => {
    await page.getByTestId(testId).click(opts)
    await pause(500)
  }
  const clickSelector = async (selector, opts) => {
    await page.locator(selector).click(opts)
    await pause(500)
  }

  // 1. Студия и стартовая доска.
  await page.addInitScript(() => window.localStorage.clear())
  await page.goto(BASE_URL)
  await page.getByTestId('board-canvas').waitFor()
  await pause(1200)

  // 2. Шаблоны -> выбрать шахматную доску.
  await click('tab-templates')
  await page.getByTestId('template-gallery').waitFor()
  await pause(600)
  await click('template-chess-8x8')
  await page.getByTestId('board-canvas').waitFor()
  await pause(1000)

  // 3. Редактор: красим пару ячеек (форк по каждой правке).
  await click('tab-editor')
  await click('species-padauk')
  await clickSelector('rect[data-cell="r0:0"]')
  await page.getByTestId('fork-dialog').waitFor()
  await pause(400)
  await click('fork-confirm')
  await pause(300)

  await click('species-wenge')
  await clickSelector('rect[data-cell="r2:2"]')
  await page.getByTestId('fork-dialog').waitFor()
  await pause(400)
  await click('fork-confirm')
  await pause(800)

  // 4. Генератор: перемешать, добавить в избранное, эволюция.
  await click('tab-generate')
  await page.getByTestId('generator-panel').waitFor()
  await pause(600)
  await click('gen-shuffle')
  await pause(600)
  await click('gen-fav-2')
  await pause(400)
  await click('gen-evolve')
  await pause(1000)

  // 5. Фото-вкладка.
  await click('tab-photo')
  await page.getByTestId('photo-panel').waitFor()
  const fixture = path.resolve(import.meta.dirname, '../e2e/fixtures/demo-blocks.png')
  await page.getByTestId('photo-file').setInputFiles(fixture)
  await page.getByTestId('photo-preview').waitFor()
  await pause(1500)

  // 6. 3D-вкладка: даём сцене прогрузиться и покрутить камеру.
  await click('tab-view3d')
  const canvas = page.locator('[data-testid="view3d"] canvas')
  await canvas.waitFor({ timeout: 30000 })
  await pause(1000)
  const box = await canvas.boundingBox()
  if (box) {
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2
    await page.mouse.move(cx, cy)
    await page.mouse.down()
    await page.mouse.move(cx + 220, cy - 60, { steps: 20 })
    await pause(200)
    await page.mouse.move(cx - 150, cy + 40, { steps: 20 })
    await page.mouse.up()
  }
  await pause(1000)

  // 7. Экспорт: скачать PDF.
  await click('tab-editor')
  await page.getByTestId('board-canvas').waitFor()
  await pause(500)
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-pdf').click()])
  await download.path()
  await pause(1500)

  await context.close()
  await browser.close()

  // Playwright сохраняет видео под случайным именем: переносим в предсказуемый путь.
  const files = await readdir(VIDEO_DIR)
  const webm = files.find((f) => f.endsWith('.webm'))
  if (!webm) throw new Error('видео не записалось')
  const dest = path.join(OUT_DIR, 'demo.webm')
  await rename(path.join(VIDEO_DIR, webm), dest)
  console.log(`видео сохранено: ${dest}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
