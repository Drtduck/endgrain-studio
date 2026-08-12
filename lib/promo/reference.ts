import { PROMO_COMMON_RULES } from './prompts'

/**
 * Генерация по референсу: пользователь приносит понравившийся кадр, модель
 * раскладывает его на приёмы съёмки, а рисуем мы уже свою доску теми же приёмами.
 *
 * Важное про смысл фичи и про право: с референса снимается описание стиля
 * (свет, ракурс, фон, палитра, оптика, настроение), а не содержимое. Предмет в
 * промпт подставляется наш, из describeBoard. Копией чужого кадра результат не
 * является, и оговорка об этом висит в интерфейсе рядом с загрузкой.
 *
 * Файл чистый: ни сети, ни server-only. Промпт и разбор ответа тестируются напрямую.
 */

/** Разбор референса по составляющим. Ровно эти поля просим у модели в JSON. */
export interface StyleAnalysis {
  readonly lighting: string
  readonly angle: string
  readonly background: string
  readonly palette: string
  readonly composition: string
  readonly mood: string
  readonly lens: string
  readonly postProcessing: string
}

export const STYLE_FIELDS: readonly (keyof StyleAnalysis)[] = [
  'lighting',
  'angle',
  'background',
  'palette',
  'composition',
  'mood',
  'lens',
  'postProcessing',
]

/** Длина одного поля разбора. Ограничение и на модель, и на правку человеком. */
export const STYLE_FIELD_MAX = 400

/**
 * Инструкция vision-модели. Просим именно приёмы съёмки и прямо запрещаем
 * называть предмет: предмет у нас свой, а описание чужого объекта в промпте
 * потом вылезло бы посторонней вещью в кадре.
 */
export const ANALYSIS_PROMPT = [
  'You are a product photography director. Analyse the attached photograph as a lighting and framing recipe.',
  'Describe only HOW it was shot, never WHAT object is in it. Do not name, imply or describe the subject,',
  'any brand, any logo or any person. If a field is not readable from the image, describe the most likely setup.',
  'Answer with JSON only, using exactly these keys and one or two English sentences per value:',
  '- lighting: light sources, direction, quality, contrast ratio, shadow behaviour',
  '- angle: camera height and orientation relative to the subject',
  '- background: surface, backdrop, depth, what is visible behind and how far it falls off',
  '- palette: dominant colours, temperature, saturation',
  '- composition: framing, placement in frame, negative space, props arrangement as abstract shapes',
  '- mood: the feeling the shot communicates',
  '- lens: apparent focal length, aperture and depth of field',
  '- postProcessing: grade, contrast curve, grain, sharpening, any visible retouching style',
].join('\n')

/** JSON-схема ответа для responseSchema: без неё модель нет-нет да завернёт JSON в прозу. */
export const ANALYSIS_RESPONSE_SCHEMA = {
  type: 'object',
  properties: Object.fromEntries(STYLE_FIELDS.map((field) => [field, { type: 'string' }])),
  required: [...STYLE_FIELDS],
  propertyOrdering: [...STYLE_FIELDS],
} as const

function clean(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.replace(/\s+/g, ' ').trim().slice(0, STYLE_FIELD_MAX)
}

/**
 * Разбор ответа модели. Модель отвечает текстом, даже когда её просили про JSON,
 * поэтому: пробуем разобрать целиком, а если не вышло - вырезаем первый объект
 * из строки. Пустой результат честнее выдуманного, поэтому null, а не заглушка.
 */
export function parseStyleAnalysis(text: string): StyleAnalysis | null {
  const candidates = [text]
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start >= 0 && end > start) candidates.push(text.slice(start, end + 1))

  for (const candidate of candidates) {
    let raw: unknown
    try {
      raw = JSON.parse(candidate)
    } catch {
      continue
    }
    if (typeof raw !== 'object' || raw === null) continue
    const record = raw as Record<string, unknown>
    const style = Object.fromEntries(STYLE_FIELDS.map((field) => [field, clean(record[field])])) as unknown as StyleAnalysis
    // Хотя бы половина полей должна быть заполнена: одно случайное совпадение
    // ключа в постороннем JSON не должно сойти за разбор кадра.
    const filled = STYLE_FIELDS.filter((field) => style[field].length > 0).length
    if (filled * 2 >= STYLE_FIELDS.length) return style
  }
  return null
}

/** Приводит разбор к безопасному виду после правки человеком в интерфейсе. */
export function normalizeStyle(style: StyleAnalysis): StyleAnalysis {
  return Object.fromEntries(STYLE_FIELDS.map((field) => [field, clean(style[field])])) as unknown as StyleAnalysis
}

/**
 * Промпт генерации: разбор стиля плюс наш предмет. Предмет идёт отдельной
 * строкой и последним по важности абзацем, чтобы модель не пыталась дорисовать
 * то, что было на референсе.
 */
export function referencePrompt(style: StyleAnalysis, description: string, variant = 0): string {
  const recipe = [
    `Lighting: ${style.lighting}`,
    `Camera angle: ${style.angle}`,
    `Background: ${style.background}`,
    `Colour palette: ${style.palette}`,
    `Composition: ${style.composition}`,
    `Mood: ${style.mood}`,
    `Lens: ${style.lens}`,
    `Post-processing: ${style.postProcessing}`,
  ]
    .filter((line) => !line.endsWith(': '))
    .join('\n')

  // Кадры одной серии обязаны отличаться, иначе человек платит квотой за копии.
  const nudge = VARIANTS[variant % VARIANTS.length]

  return [
    'Recreate the photographic style described below with a completely different subject.',
    'Follow the recipe for light, camera, background and grade. Do not reproduce any object from it.',
    '',
    recipe,
    '',
    `Variation: ${nudge}`,
    '',
    `Subject: ${description}`,
    '',
    PROMO_COMMON_RULES,
  ].join('\n')
}

/** Сдвиги ракурса для кадров одной серии: один рецепт, разные точки съёмки. */
const VARIANTS: readonly string[] = [
  'straight-on hero framing, subject centred',
  'three-quarter angle, subject slightly off centre with negative space on one side',
  'closer crop on the surface texture, subject filling most of the frame',
  'wider framing with more of the surrounding surface visible',
]

export const REFERENCE_VARIANTS = VARIANTS.length
