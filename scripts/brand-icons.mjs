// Рендерит public/brand/beaver-simple.svg в PNG нужных размеров через Chromium,
// который уже стоит для Playwright. Никаких sharp и ImageMagick.
// Запускать вручную: pnpm brand:icons. Результаты коммитятся, скрипт в CI не запускается.
import { chromium } from '@playwright/test'
import { writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import path from 'node:path'

const SVG_PATH = path.resolve(import.meta.dirname, '../public/brand/beaver-simple.svg')

const SIZES = [
  { size: 180, out: path.resolve(import.meta.dirname, '../app/apple-icon.png') },
  { size: 512, out: path.resolve(import.meta.dirname, '../public/brand/beaver-512.png') },
  { size: 32, out: path.resolve(import.meta.dirname, '../public/brand/beaver-32.png') },
]

async function main() {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    for (const { size, out } of SIZES) {
      await page.setViewportSize({ width: size, height: size })
      await page.goto(pathToFileURL(SVG_PATH).href)
      await page.evaluate((px) => {
        // Открытый напрямую SVG-файл это image-документ без <body>: браузер сам
        // подгоняет его под окно, поэтому размер выставляем на корневом узле.
        const svg = document.documentElement
        svg.style.width = `${px}px`
        svg.style.height = `${px}px`
      }, size)
      const buffer = await page.screenshot({ omitBackground: true })
      await writeFile(out, buffer)
      console.log(`written ${out} (${size}x${size})`)
    }
  } finally {
    await browser.close()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
