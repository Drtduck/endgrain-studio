// Рендерит обложки статей блога (public/blog/<slug>/cover.jpg) через Chromium,
// который уже стоит для Playwright. Тот же приём, что и в brand-icons.mjs:
// screenshot HTML-заглушки вместо подключения sharp/ImageMagick.
// Запускать вручную: node scripts/blog-covers.mjs. Результаты коммитятся.
import { chromium } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
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
  {
    slug: 'free-end-grain-design-tool',
    title: 'A Free Design Tool for End Grain Boards',
    subtitle: 'What the free options do and where they stop',
    stripes: ['#3a2a20', '#e3caa1', '#a5613b'],
  },
  {
    slug: 'free-end-grain-design-tool-ru',
    title: 'Бесплатная программа для торцевой доски',
    subtitle: 'Что умеют бесплатные инструменты и где они кончаются',
    stripes: ['#3a2a20', '#e3caa1', '#a5613b'],
  },
  {
    slug: 'real-cost-end-grain-cutting-board',
    title: 'The Real Cost of an End Grain Board',
    subtitle: 'Five board feet in, two board feet out',
    stripes: ['#a8422a', '#e3caa1', '#5b3a24'],
  },
  {
    slug: 'real-cost-end-grain-cutting-board-ru',
    title: 'Себестоимость торцевой доски',
    subtitle: 'Пять board feet на входе, два на выходе',
    stripes: ['#a8422a', '#e3caa1', '#5b3a24'],
  },
  {
    slug: 'checkerboard-3d-cube-strip-widths',
    title: 'Checkerboard, Brick and 3D Cube Math',
    subtitle: 'Strip widths that come out even',
    stripes: ['#3a2a20', '#e3caa1', '#5b3a24', '#a5613b'],
  },
  {
    slug: 'checkerboard-3d-cube-strip-widths-ru',
    title: 'Шахматка, кирпичик и 3D-куб',
    subtitle: 'Ширины полос, которые сходятся нацело',
    stripes: ['#3a2a20', '#e3caa1', '#5b3a24', '#a5613b'],
  },
  {
    slug: 'why-end-grain-board-warped',
    title: 'Why the Board Cupped After Glue-Up',
    subtitle: 'Moisture content decides the shape',
    stripes: ['#5b3a24', '#e3caa1', '#a8422a'],
  },
  {
    slug: 'why-end-grain-board-warped-ru',
    title: 'Почему доску повело после склейки',
    subtitle: 'Форму доски решает влажность',
    stripes: ['#5b3a24', '#e3caa1', '#a8422a'],
  },
  {
    slug: 'board-feet-12x16-end-grain-board',
    title: 'Board Feet for a 12x16 Board',
    subtitle: 'Two in the board, five on the invoice',
    stripes: ['#e3caa1', '#5b3a24', '#a5613b'],
  },
  {
    slug: 'board-feet-12x16-end-grain-board-ru',
    title: 'Сколько дерева на доску 305х406',
    subtitle: 'Два board feet в доске, пять в чеке',
    stripes: ['#e3caa1', '#5b3a24', '#a5613b'],
  },
  {
    slug: 'how-much-to-charge-end-grain-board',
    title: 'What to Charge for an End Grain Board',
    subtitle: 'Cost first, margin second, fees third',
    stripes: ['#a8422a', '#5b3a24', '#e3caa1'],
  },
  {
    slug: 'how-much-to-charge-end-grain-board-ru',
    title: 'Сколько просить за торцевую доску',
    subtitle: 'Сначала себестоимость, потом наценка, потом комиссия',
    stripes: ['#a8422a', '#5b3a24', '#e3caa1'],
  },
  {
    slug: 'repeat-order-same-pattern',
    title: 'Repeating a Pattern on Order',
    subtitle: 'Six numbers that make the second board match',
    stripes: ['#5b3a24', '#e3caa1', '#a5613b'],
  },
  {
    slug: 'repeat-order-same-pattern-ru',
    title: 'Повтор узора под заказ',
    subtitle: 'Шесть чисел, чтобы вторая доска совпала',
    stripes: ['#5b3a24', '#e3caa1', '#a5613b'],
  },
  {
    slug: 'planer-end-grain-cutting-board',
    title: 'End Grain Through a Planer',
    subtitle: 'It works until the board comes apart',
    stripes: ['#3a2a20', '#a8422a', '#e3caa1'],
  },
  {
    slug: 'steps-to-make-end-grain-cutting-board',
    title: 'Making an End Grain Board',
    subtitle: 'Nine steps, two of them are waiting',
    stripes: ['#e3caa1', '#5b3a24', '#a5613b'],
  },
  {
    slug: 'steps-to-make-end-grain-cutting-board-ru',
    title: 'Торцевая доска от и до',
    subtitle: 'Девять шагов, два из них - ожидание',
    stripes: ['#e3caa1', '#5b3a24', '#a5613b'],
  },
  {
    slug: 'planer-end-grain-cutting-board-ru',
    title: 'Торцевая доска и рейсмус',
    subtitle: 'Работает, пока щит не развалился',
    stripes: ['#3a2a20', '#a8422a', '#e3caa1'],
  },
  {
    slug: 'kerf-and-milling-waste-budget',
    title: 'Kerf and Milling Waste',
    subtitle: 'Budget 55 percent, not 25',
    stripes: ['#a8422a', '#e3caa1', '#5b3a24'],
  },
  {
    slug: 'kerf-and-milling-waste-budget-ru',
    title: 'Отходы на пропил и строжку',
    subtitle: 'Закладывать 55 процентов, а не 25',
    stripes: ['#a8422a', '#e3caa1', '#5b3a24'],
  },
  {
    slug: 'board-cracked-along-glue-line',
    title: 'Cracked Along the Glue Line',
    subtitle: 'Starved joint, clamps, or wood movement',
    stripes: ['#5b3a24', '#e3caa1', '#a8422a'],
  },
  {
    slug: 'board-cracked-along-glue-line-ru',
    title: 'Трещина по шву склейки',
    subtitle: 'Голодный шов, зажим или движение древесины',
    stripes: ['#5b3a24', '#e3caa1', '#a8422a'],
  },
  {
    slug: 'losing-money-etsy-fees',
    title: 'Losing Money After Etsy Fees?',
    subtitle: 'One $300 board through the whole fee stack',
    stripes: ['#3a2a20', '#a8422a', '#e3caa1'],
  },
  {
    slug: 'losing-money-etsy-fees-ru',
    title: 'Минус после комиссий Etsy',
    subtitle: 'Доска за $300 через весь стек сборов',
    stripes: ['#3a2a20', '#a8422a', '#e3caa1'],
  },
  {
    slug: 'chevron-end-grain-board-angle',
    title: 'What Angle for a Chevron?',
    subtitle: 'Miter setting, staircase cells and the waste',
    stripes: ['#e3caa1', '#5b3a24', '#a8422a'],
  },
  {
    slug: 'chevron-end-grain-board-angle-ru',
    title: 'Под каким углом шеврон',
    subtitle: 'Ус, лесенка из клеток и цена угла',
    stripes: ['#e3caa1', '#5b3a24', '#a8422a'],
  },
  {
    slug: 'over-tighten-clamps-starve-glue-joint',
    title: 'Can You Starve a Glue Joint?',
    subtitle: 'What clamps really deliver, in psi',
    stripes: ['#5b3a24', '#e3caa1', '#a5613b'],
  },
  {
    slug: 'over-tighten-clamps-starve-glue-joint-ru',
    title: 'Голодный шов и струбцины',
    subtitle: 'Сколько давления даёт рука на рукоятке',
    stripes: ['#5b3a24', '#e3caa1', '#a5613b'],
  },
  {
    slug: 'glue-joints-fail-second-glue-up',
    title: 'Second Glue-Up Failures',
    subtitle: 'Four causes you can read off the broken joint',
    stripes: ['#a8422a', '#e3caa1', '#3a2a20'],
  },
  {
    slug: 'glue-joints-fail-second-glue-up-ru',
    title: 'Швы второй склейки',
    subtitle: 'Четыре причины, которые видно на изломе',
    stripes: ['#a8422a', '#e3caa1', '#3a2a20'],
  },
  {
    slug: 'care-card-cutting-board',
    title: 'The Care Card',
    subtitle: 'Six lines that keep the board flat',
    stripes: ['#e3caa1', '#5b3a24', '#a5613b'],
  },
  {
    slug: 'care-card-cutting-board-ru',
    title: 'Памятка по уходу',
    subtitle: 'Шесть строк, которые держат доску плоской',
    stripes: ['#e3caa1', '#5b3a24', '#a5613b'],
  },
  {
    slug: 'end-grain-vs-edge-grain',
    title: 'End Grain vs Edge Grain',
    subtitle: 'Which one to build, and what it costs you',
    stripes: ['#a8422a', '#e3caa1', '#5b3a24'],
  },
  {
    slug: 'end-grain-vs-edge-grain-ru',
    title: 'Торцевая или продольная',
    subtitle: 'Какую делать и во что она обходится',
    stripes: ['#a8422a', '#e3caa1', '#5b3a24'],
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
  // Опциональный фильтр по slug: node scripts/blog-covers.mjs <slug> [slug...]
  // Без аргументов рендерит все обложки, как раньше.
  const only = process.argv.slice(2)
  const covers = only.length ? COVERS.filter((c) => only.includes(c.slug)) : COVERS
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } })
    for (const cover of covers) {
      await page.setContent(html(cover))
      const out = path.resolve(import.meta.dirname, `../public/blog/${cover.slug}/cover.jpg`)
      await mkdir(path.dirname(out), { recursive: true })
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
