import { describe, expect, it } from 'vitest'
import { compile } from '@/lib/engine'
import { calcProject } from '@/lib/calc'
import { makeCheckerboard } from '@/lib/designs/samples'
import { buildInstructionPdf } from './pdf'

const design = makeCheckerboard()
const model = compile(design)
const calc = calcProject(design, model)

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
})
