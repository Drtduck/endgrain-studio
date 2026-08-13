import { describe, expect, it } from 'vitest'
import { baseDesign, colBandsMm, compile, rowBandsMm, stripsPanel } from '@/lib/engine'
import { makeCheckerboard } from '@/lib/designs/samples'
import { speciesHex } from '@/lib/species'
import { COL_LABEL_MARGIN_MM, ROW_LABEL_MARGIN_MM } from '@/lib/render2d/layout'
import { boardSvgString, escapeXml, renderBoardSvg } from './svg'

const design = makeCheckerboard()
const model = compile(design)

/** Панель P с одним угловым SliceRef на Q, вклеенным как единственная колонка ряда r1. */
function angledDesign() {
  return baseDesign({
    panels: [
      stripsPanel('Q', ['walnut', 'maple'], 12),
      { id: 'P', elements: [{ kind: 'sliceRef', panelId: 'Q', thicknessMm: 10, angleDeg: 30, offsetMm: 0 }] },
    ],
    rows: [{ id: 'r1', panelId: 'P', thicknessMm: 12, angleDeg: 0, flip: false, mirror: false, trimMm: 5 }],
  })
}

function countRects(svg: string): number {
  return svg.split('<rect').length - 1
}

function countPolygons(svg: string): number {
  return svg.split('<polygon').length - 1
}

describe('renderBoardSvg', () => {
  it('отдаёт самостоятельный документ с xmlns', () => {
    const { svg } = renderBoardSvg(model)
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"')
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true)
  })

  it('рисует по прямоугольнику на ячейку плюс подложку', () => {
    const { svg } = renderBoardSvg(model)
    expect(countRects(svg)).toBe(model.cells.length + 1)
  })

  it('красит ячейки цветами пород', () => {
    const { svg } = renderBoardSvg(model)
    const first = model.cells[0]
    expect(first).toBeDefined()
    if (first) expect(svg).toContain(`fill="${speciesHex(first.speciesId)}"`)
  })

  it('без подписи и заголовка высота равна длине доски', () => {
    const { svg } = renderBoardSvg(model)
    expect(svg).toContain(`viewBox="0 0 ${model.widthMm} ${model.lengthMm}"`)
  })

  it('заголовок и подпись увеличивают viewBox и попадают в текст', () => {
    const { svg } = renderBoardSvg(model, { title: 'Шахматка', caption: '300 × 450 мм' })
    expect(svg).toContain('>Шахматка<')
    expect(svg).toContain('>300 × 450 мм<')
    expect(svg).not.toContain(`viewBox="0 0 ${model.widthMm} ${model.lengthMm}"`)
  })

  it('колонка номеров рядов сдвигает доску и печатает номера', () => {
    const bands = rowBandsMm(design)
    const { svg } = renderBoardSvg(model, { rowLabels: bands })
    expect(svg).toContain(`viewBox="0 0 ${model.widthMm + ROW_LABEL_MARGIN_MM} ${model.lengthMm}"`)
    expect(svg).toContain(`>${bands.length}<`)
  })

  it('колонка номеров колонок расширяет высоту и печатает номера под доской', () => {
    const bands = colBandsMm(design)
    const { svg } = renderBoardSvg(model, { colLabels: bands })
    expect(svg).toContain(`viewBox="0 0 ${model.widthMm} ${model.lengthMm + COL_LABEL_MARGIN_MM}"`)
    expect(svg).toContain(`>${bands.length}<`)
  })

  it('пиксельный размер согласован с maxPx', () => {
    const r = renderBoardSvg(model, { maxPx: 1200 })
    expect(Math.max(r.widthPx, r.heightPx)).toBeCloseTo(1200, 6)
  })

  it('экранирует спецсимволы в заголовке', () => {
    const { svg } = renderBoardSvg(model, { title: 'A & B <тест> "кавычки"' })
    expect(svg).toContain('A &amp; B &lt;тест&gt; &quot;кавычки&quot;')
    expect(svg).not.toContain('<тест>')
  })

  it('никогда не содержит длинного тире', () => {
    const { svg } = renderBoardSvg(model, { title: 'Доска', caption: 'габарит 300 × 450' })
    expect(svg.includes(String.fromCharCode(0x2014))).toBe(false)
  })

  it('пустая модель отдаёт валидный пустой svg, а не бросает', () => {
    const empty = { ...model, cells: [], widthMm: 0, lengthMm: 0 }
    expect(() => renderBoardSvg(empty)).not.toThrow()
    expect(renderBoardSvg(empty).svg).toContain('<svg')
  })

  it('прямой узор не содержит ни одного polygon', () => {
    const { svg } = renderBoardSvg(model)
    expect(countPolygons(svg)).toBe(0)
  })

  it('угловой узор рисует ячейки с poly через валидный polygon', () => {
    const angledModel = compile(angledDesign())
    expect(angledModel.cells.some((c) => c.poly !== undefined)).toBe(true)
    const { svg } = renderBoardSvg(angledModel)
    expect(countPolygons(svg)).toBe(angledModel.cells.length)
    expect(countRects(svg)).toBe(1) // только фон

    const pointsMatches = [...svg.matchAll(/<polygon points="([^"]+)"/g)]
    expect(pointsMatches).toHaveLength(angledModel.cells.length)
    for (const match of pointsMatches) {
      const coords = match[1]!.trim().split(/\s+/).filter(Boolean)
      expect(coords.length).toBeGreaterThanOrEqual(3)
      for (const pair of coords) {
        const [x, y] = pair.split(',').map(Number)
        expect(Number.isFinite(x)).toBe(true)
        expect(Number.isFinite(y)).toBe(true)
      }
    }
  })
})

describe('escapeXml', () => {
  it('покрывает пять сущностей', () => {
    expect(escapeXml(`<>&"'`)).toBe('&lt;&gt;&amp;&quot;&apos;')
  })
})

describe('boardSvgString', () => {
  it('это тонкая обёртка над renderBoardSvg', () => {
    expect(boardSvgString(model)).toBe(renderBoardSvg(model).svg)
  })
})
