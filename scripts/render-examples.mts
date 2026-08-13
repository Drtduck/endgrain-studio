// Разовый скрипт для конкурсной заявки: рендерит несколько разных досок в SVG,
// затем растеризует их в PNG через headless Chromium (как scripts/brand-icons.mjs).
// Запуск: npx tsx scripts/render-examples.mts
import { chromium } from '@playwright/test'
import { writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { compile } from '../lib/engine'
import { renderBoardSvg } from '../lib/export/svg'
import { templateById } from '../lib/designs/templates'
import { toDesign } from '../lib/generators/families'
import { randomGenome } from '../lib/generators/genome'

const OUT_DIR = path.resolve(import.meta.dirname, '../docs/submission/examples')

interface Example {
  readonly file: string
  readonly title: string
  readonly design: () => import('../lib/engine').Design
}

const examples: Example[] = [
  {
    file: 'checkerboard-classic.png',
    title: 'Классическая шахматка',
    design: () => templateById('checkerboard-classic')!.build(),
  },
  {
    file: 'chess-8x8.png',
    title: 'Шахматная доска 8x8',
    design: () => templateById('chess-8x8')!.build(),
  },
  {
    file: 'inlay-band.png',
    title: 'Инкрустация лентой',
    design: () => templateById('inlay-band')!.build(),
  },
  {
    file: 'mosaic-random.png',
    title: 'Случайная мозаика',
    design: () => templateById('mosaic-random')!.build(),
  },
  {
    file: 'generator-symmetry-p4m.png',
    title: 'Генератор: симметрия p4m (seed 42)',
    design: () => toDesign(randomGenome('symmetry-p4m', 42)),
  },
  {
    file: 'generator-gradient.png',
    title: 'Генератор: градиент (seed 7)',
    design: () => toDesign(randomGenome('gradient', 7)),
  },
]

async function main() {
  await mkdir(OUT_DIR, { recursive: true })
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    for (const example of examples) {
      const design = example.design()
      const model = compile(design)
      const { svg, widthPx, heightPx } = renderBoardSvg(model, {
        title: example.title,
        caption: `Габарит ${Math.round(model.widthMm)} x ${Math.round(model.lengthMm)} мм`,
        maxPx: 1200,
      })
      const scale = Math.max(1, 1200 / Math.max(widthPx, heightPx))
      await page.setViewportSize({ width: Math.ceil(widthPx * scale), height: Math.ceil(heightPx * scale) })
      await page.setContent(
        `<!doctype html><html><body style="margin:0;background:#ffffff">${svg}</body></html>`,
      )
      const svgEl = page.locator('svg')
      await svgEl.evaluate(
        (el, s) => {
          el.style.width = `${(el.getBoundingClientRect().width || 1) * s}px`
        },
        scale,
      )
      const buffer = await page.screenshot({ fullPage: true })
      const out = path.join(OUT_DIR, example.file)
      await writeFile(out, buffer)
      console.log(`written ${out}`)
    }
  } finally {
    await browser.close()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
