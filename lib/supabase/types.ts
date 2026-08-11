import type { Design } from '@/lib/engine'

/** Строка public.projects. Держим руками: две таблицы не стоят генерации типов. */
export interface ProjectRow {
  readonly id: string
  readonly user_id: string
  readonly name: string
  readonly design: Design
  readonly created_at: string
  readonly updated_at: string
}

/** То, что уезжает на клиент в списке: документ грузим отдельным запросом. */
export interface ProjectSummary {
  readonly id: string
  readonly name: string
  readonly updatedAt: string
}
