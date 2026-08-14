// Рендерит обложки статей блога (public/blog/<slug>/cover.jpg) через Chromium,
// который уже стоит для Playwright. Тот же приём, что и в brand-icons.mjs:
// screenshot HTML-заглушки вместо подключения sharp/ImageMagick.
// Запускать вручную: node scripts/blog-covers.mjs. Результаты коммитятся.
import { chromium } from '@playwright/test'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'

const WIDTH = 1200
const HEIGHT = 630

const COVERS = [
  {
    slug: 'kerf-i-pripuski',
    title: 'Пропил и припуски',
    subtitle: 'Почему доска выходит уже, чем в чертеже',
    stripes: ['#5b3a24', '#a8422a', '#e3caa1'],
  },
  {
    slug: 'vybor-porod',
    title: 'Породы для торцевой доски',
    subtitle: 'Что клеится, что ведёт, что нельзя есть',
    stripes: ['#e3caa1', '#a5613b', '#3a2a20'],
  },
  {
    slug: 'shema-perekleyki',
    title: 'Схема переклейки',
    subtitle: 'От полос до готовой доски',
    stripes: ['#5b3a24', '#e3caa1', '#a8422a', '#3a2a20'],
  },
  {
    slug: 'shirina-polos-vtoroy-skleyki',
    title: 'Ширина полос второй склейки',
    subtitle: 'Чистовая толщина плюс припуск на выравнивание',
    stripes: ['#a5613b', '#e3caa1', '#5b3a24'],
  },
  {
    slug: 'shirina-polos-vtoroy-skleyki-en',
    title: 'Strips for the Second Glue-Up',
    subtitle: 'Finished thickness plus a flattening allowance',
    stripes: ['#a5613b', '#e3caa1', '#5b3a24'],
  },
  {
    slug: 'kerf-i-pripuski-en',
    title: 'Kerf and Allowances',
    subtitle: 'Why the board comes out narrower than the drawing',
    stripes: ['#5b3a24', '#a8422a', '#e3caa1'],
  },
  {
    slug: 'vybor-porod-en',
    title: 'Choosing Wood Species',
    subtitle: 'What glues well, what moves, what you cannot eat off',
    stripes: ['#e3caa1', '#a5613b', '#3a2a20'],
  },
  {
    slug: 'shema-perekleyki-en',
    title: 'Reading a Glue-Up Diagram',
    subtitle: 'From strips to a finished board',
    stripes: ['#5b3a24', '#e3caa1', '#a8422a', '#3a2a20'],
  },
]

function html({ title, subtitle, stripes }) {
  const bands = stripes.map((color) => `<div style="flex:1;height:100%;background:${color}"></div>`).join('')
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { width:${WIDTH}px; height:${HEIGHT}px; display:flex; background:#EFEAE1; font-family: Georgia, serif; }
  .text { display:flex; flex-direction:column; justify-content:center; padding:0 0 0 72px; flex:1; }
  .kicker { font-size:28px; color:#5A5048; margin-bottom:20px; font-family: Arial, sans-serif; }
  .title { font-size:64px; line-height:1.1; color:#241E19; }
  .subtitle { font-size:30px; color:#5A5048; margin-top:20px; font-family: Arial, sans-serif; }
  .stripes { display:flex; width:220px; height:100%; }
</style></head>
<body>
  <div class="text">
    <div class="kicker">Endgrain Studio &middot; Блог</div>
    <div class="title">${title}</div>
    <div class="subtitle">${subtitle}</div>
  </div>
  <div class="stripes">${bands}</div>
</body></html>`
}

async function main() {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } })
    for (const cover of COVERS) {
      await page.setContent(html(cover))
      const out = path.resolve(import.meta.dirname, `../public/blog/${cover.slug}/cover.jpg`)
      const buffer = await page.screenshot({ type: 'jpeg', quality: 88 })
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
