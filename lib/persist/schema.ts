import { z } from 'zod'
import { DEFAULT_PLANER_WIDTH_MM, SCHEMA_VERSION, type Design } from '@/lib/engine'

export const CURRENT_SCHEMA_VERSION = SCHEMA_VERSION

const mm = z.number().finite()

const stripSchema = z.object({
  kind: z.literal('strip'),
  speciesId: z.string().min(1),
  widthMm: mm.positive(),
})

const sliceRefSchema = z.object({
  kind: z.literal('sliceRef'),
  panelId: z.string().min(1),
  thicknessMm: mm.positive(),
  angleDeg: mm,
  offsetMm: mm,
})

const panelSchema = z.object({
  id: z.string().min(1),
  elements: z.array(z.discriminatedUnion('kind', [stripSchema, sliceRefSchema])),
})

const rowSchema = z.object({
  id: z.string().min(1),
  panelId: z.string().min(1),
  thicknessMm: mm.positive(),
  angleDeg: mm,
  flip: z.boolean(),
  mirror: z.boolean(),
  trimMm: mm.nonnegative(),
})

export const designSchema = z.object({
  schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
  id: z.string().min(1),
  name: z.string(),
  species: z.array(z.string().min(1)),
  panels: z.array(panelSchema),
  rows: z.array(rowSchema),
  board: z.object({
    targetWidthMm: mm.positive(),
    targetLengthMm: mm.positive(),
    thicknessMm: mm.positive(),
  }),
  kerfMm: mm.positive(),
  planingAllowanceMm: mm.nonnegative(),
  planerWidthMm: mm.positive(),
})

// Проверка на этапе типов: выход схемы совместим с доменным Design.
const _compat: (d: z.infer<typeof designSchema>) => Design = (d) => d
void _compat

/**
 * Реестр миграций: ключ - версия документа ДО применения.
 * Версия 0 (документы без schemaVersion) приводится к v1.
 */
export const migrations: Readonly<Record<number, (doc: unknown) => unknown>> = {
  0: (doc) => {
    const d = doc as Record<string, unknown>
    return { ...d, schemaVersion: 1, planerWidthMm: typeof d['planerWidthMm'] === 'number' ? d['planerWidthMm'] : DEFAULT_PLANER_WIDTH_MM }
  },
}

export function migrate(doc: unknown): unknown {
  let current = doc
  for (let v = versionOf(current); v < CURRENT_SCHEMA_VERSION; v = versionOf(current)) {
    const step = migrations[v]
    if (!step) throw new Error(`нет миграции с версии ${v}`)
    const next = step(current)
    if (versionOf(next) <= v) throw new Error(`миграция с версии ${v} не подняла версию`)
    current = next
  }
  return current
}

function versionOf(doc: unknown): number {
  const v = (doc as { schemaVersion?: unknown } | null)?.schemaVersion
  return typeof v === 'number' ? v : 0
}

/** Единственный читатель документа для веба, CLI и OG-роута. */
export function parseDesign(input: unknown): Design {
  return designSchema.parse(migrate(input))
}
