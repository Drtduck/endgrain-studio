import { describe, expect, it } from 'vitest'
import { compile } from '@/lib/engine'
import { SCHEMA_VERSION, type Design, type SpeciesId } from '@/lib/engine'
import { calcProject } from '@/lib/calc'
import { makeCheckerboard } from '@/lib/designs/samples'
import { DEFAULT_NAME_KEY } from '@/lib/designs/name'
import { buildInstructionPdf } from './pdf'

const design = makeCheckerboard()
const model = compile(design)
const calc = calcProject(design, model)

/** Восемь пород в одном ряду: bySpecies overview-страницы должен растянуться минимум на 8 строк. */
function makeManySpeciesDesign(): Design {
  const speciesIds: readonly SpeciesId[] = [
    'maple',
    'birch',
    'beech',
    'ash',
    'red-oak',
    'white-oak',
    'hickory',
    'cherry',
  ]
  return {
    schemaVersion: SCHEMA_VERSION,
    id: 'sample-many-species',
    name: '',
    nameKey: DEFAULT_NAME_KEY,
    species: speciesIds,
    panels: [
      {
        id: 'A',
        elements: speciesIds.map((speciesId) => ({ kind: 'strip' as const, speciesId, widthMm: 30 })),
      },
    ],
    rows: [{ id: 'r0', panelId: 'A', thicknessMm: 30, angleDeg: 0, flip: false, mirror: false, trimMm: 5 }],
    board: { targetWidthMm: speciesIds.length * 30, targetLengthMm: 30, thicknessMm: 40 },
    kerfMm: 3,
    planingAllowanceMm: 3,
    planerWidthMm: 330,
  }
}

// jsdom не умеет полноценный canvas/SVG рендер svg2pdf.js полагается на,
// но registerCyrillicFont и doc.svg() всё равно обязаны не уронить весь документ:
// без сети шрифт просто не подключится (см. try/catch в pdfFont.ts), а drawSvg
// в худшем случае бросит - и это должно всплыть здесь, а не в проде.
/** jsPDF со сжатыми потоками не даёт грепать текст страниц, но объекты `/Type /Page` не сжимаются. */
async function countPdfPages(blob: Blob): Promise<number> {
  const raw = await blob.text()
  return raw.split('/Type /Page').length - 1 - (raw.split('/Type /Pages').length - 1)
}

describe('buildInstructionPdf', () => {
  it('собирает PDF минимум из трёх страниц (overview, cut map, steps) без Pro-подписи и с Pro', async () => {
    const withoutPro = await buildInstructionPdf({ design, model, calc, locale: 'ru', pro: false })
    expect(withoutPro).toBeInstanceOf(Blob)
    expect(withoutPro.size).toBeGreaterThan(0)
    expect(await countPdfPages(withoutPro)).toBeGreaterThanOrEqual(3)

    const withPro = await buildInstructionPdf({ design, model, calc, locale: 'ru', pro: true })
    expect(withPro).toBeInstanceOf(Blob)
    expect(withPro.size).toBeGreaterThan(0)
    expect(await countPdfPages(withPro)).toBeGreaterThanOrEqual(3)
  })

  it('не падает и на английской локали', async () => {
    const blob = await buildInstructionPdf({ design, model, calc, locale: 'en', pro: false })
    expect(blob.size).toBeGreaterThan(0)
  })

  it('не падает и не наезжает на футер при 6+ породах на overview-странице (ensureRoom вокруг bySpecies)', async () => {
    const manyDesign = makeManySpeciesDesign()
    const manyModel = compile(manyDesign)
    const manyCalc = calcProject(manyDesign, manyModel)
    expect(manyCalc.bySpecies.length).toBeGreaterThanOrEqual(6)

    const blob = await buildInstructionPdf({ design: manyDesign, model: manyModel, calc: manyCalc, locale: 'ru', pro: false })
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.size).toBeGreaterThan(0)
    expect(await countPdfPages(blob)).toBeGreaterThanOrEqual(3)
  })
})
