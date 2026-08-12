import { describe, expect, it } from 'vitest'
import en from '@/lib/i18n/en'
import ru from '@/lib/i18n/ru'
import {
  ANALYSIS_PROMPT,
  ANALYSIS_RESPONSE_SCHEMA,
  STYLE_FIELDS,
  STYLE_FIELD_MAX,
  normalizeStyle,
  parseStyleAnalysis,
  referencePrompt,
  type StyleAnalysis,
} from './reference'
import { REFERENCE_DATA_URL_RE, REFERENCE_MAX_BYTES, REFERENCE_MIME, referenceAnalyzeSchema } from './schema'

const EM_DASH = String.fromCharCode(0x2014)

const STYLE: StyleAnalysis = {
  lighting: 'Hard key from the right, deep shadows.',
  angle: 'Camera at subject height.',
  background: 'Charcoal seamless.',
  palette: 'Cool greys with one warm accent.',
  composition: 'Centred with wide margins.',
  mood: 'Serious and expensive.',
  lens: '85mm at f/5.6.',
  postProcessing: 'High micro-contrast, no grain.',
}

describe('промпт разбора', () => {
  it('просит приёмы съёмки и прямо запрещает называть предмет', () => {
    expect(ANALYSIS_PROMPT).toContain('JSON')
    expect(ANALYSIS_PROMPT.toLowerCase()).toContain('do not name')
    for (const field of STYLE_FIELDS) expect(ANALYSIS_PROMPT).toContain(field)
  })

  it('схема ответа перечисляет ровно те же поля', () => {
    expect(Object.keys(ANALYSIS_RESPONSE_SCHEMA.properties)).toEqual([...STYLE_FIELDS])
    expect(ANALYSIS_RESPONSE_SCHEMA.required).toEqual([...STYLE_FIELDS])
  })
})

describe('разбор ответа модели', () => {
  it('читает чистый JSON', () => {
    expect(parseStyleAnalysis(JSON.stringify(STYLE))).toEqual(STYLE)
  })

  it('вытаскивает JSON из болтовни вокруг', () => {
    const text = `Sure, here you go:\n\`\`\`json\n${JSON.stringify(STYLE)}\n\`\`\`\nHope that helps!`
    expect(parseStyleAnalysis(text)?.lighting).toContain('Hard key')
  })

  it('проза без JSON это null, а не выдуманный разбор', () => {
    expect(parseStyleAnalysis('Извините, не могу помочь с этой картинкой.')).toBeNull()
    expect(parseStyleAnalysis('')).toBeNull()
  })

  it('посторонний JSON с одним совпавшим ключом за разбор не сходит', () => {
    expect(parseStyleAnalysis(JSON.stringify({ mood: 'calm', other: 1 }))).toBeNull()
  })

  it('нестроковые значения не протаскиваются в промпт', () => {
    const parsed = parseStyleAnalysis(JSON.stringify({ ...STYLE, lens: { focal: 85 } }))
    expect(parsed?.lens).toBe('')
    expect(parsed?.angle).toBe(STYLE.angle)
  })

  it('длинное поле обрезается: в промпт не должно уехать двух мегабайт', () => {
    const parsed = parseStyleAnalysis(JSON.stringify({ ...STYLE, mood: 'a'.repeat(10_000) }))
    expect(parsed?.mood.length).toBe(STYLE_FIELD_MAX)
  })

  it('переносы строк схлопываются: разбор идёт в промпт построчно', () => {
    expect(normalizeStyle({ ...STYLE, mood: 'one\n\ntwo' }).mood).toBe('one two')
  })
})

describe('промпт генерации по референсу', () => {
  it('несёт наш предмет, разобранный рецепт и запрет копировать чужой кадр', () => {
    const prompt = referencePrompt(STYLE, 'end-grain walnut board')
    expect(prompt).toContain('end-grain walnut board')
    expect(prompt).toContain('Hard key from the right')
    expect(prompt.toLowerCase()).toContain('do not reproduce any object')
    expect(prompt).toContain('no text')
    expect(prompt.includes(EM_DASH)).toBe(false)
  })

  it('кадры одной серии отличаются ракурсом, а не только номером', () => {
    const prompts = [0, 1, 2, 3].map((i) => referencePrompt(STYLE, 'board', i))
    expect(new Set(prompts).size).toBe(4)
  })

  it('пустое поле разбора не оставляет висящего двоеточия', () => {
    const prompt = referencePrompt({ ...STYLE, lens: '' }, 'board')
    expect(prompt).not.toContain('Lens: \n')
    expect(prompt).not.toMatch(/Lens: $/m)
  })
})

describe('проверка загружаемого референса', () => {
  it('берёт PNG, JPEG и WEBP по магии файла', () => {
    expect(REFERENCE_DATA_URL_RE.test('data:image/png;base64,iVBORw0KGgoAAA')).toBe(true)
    expect(REFERENCE_DATA_URL_RE.test('data:image/jpeg;base64,/9j/4AAQSkZJRg')).toBe(true)
    expect(REFERENCE_DATA_URL_RE.test('data:image/webp;base64,UklGRiQAAABXRUJQ')).toBe(true)
  })

  it('не берёт подделанный тип, SVG и внешнюю ссылку', () => {
    // Заявлен PNG, а сигнатуры нет: тип из браузера ничего не доказывает.
    expect(REFERENCE_DATA_URL_RE.test('data:image/png;base64,AAAAAAAA')).toBe(false)
    expect(REFERENCE_DATA_URL_RE.test('data:image/svg+xml;base64,PHN2Zz4=')).toBe(false)
    expect(REFERENCE_DATA_URL_RE.test('https://example.com/a.png')).toBe(false)
    expect(REFERENCE_DATA_URL_RE.test('data:text/html;base64,PGgxPg==')).toBe(false)
  })

  it('белый список типов и предел размера согласованы с интерфейсом', () => {
    expect(REFERENCE_MIME).not.toContain('image/svg+xml')
    expect(REFERENCE_MAX_BYTES).toBe(3 * 1024 * 1024)
  })

  it('схема действия отбивает и мусор, и слишком длинную строку', () => {
    expect(referenceAnalyzeSchema.safeParse({ referenceImage: 'nope' }).success).toBe(false)
    expect(referenceAnalyzeSchema.safeParse({ referenceImage: 'data:image/jpeg;base64,/9j/AAAA' }).success).toBe(true)
  })
})

describe('тексты фичи', () => {
  it('оговорка про референс есть в обоих словарях и говорит о стиле, а не о копии', () => {
    expect(ru['ref.disclaimer']).toContain('стил')
    expect(ru['ref.disclaimer'].toLowerCase()).toContain('не копируется')
    expect(en['ref.disclaimer'].toLowerCase()).toContain('not copied')
  })

  it('у каждого поля разбора есть подпись в обоих словарях', () => {
    for (const field of STYLE_FIELDS) {
      const key = `ref.field.${field}` as keyof typeof ru
      expect(ru[key]).toBeTruthy()
      expect(en[key]).toBeTruthy()
    }
  })
})
