import type { Locale } from '@/lib/i18n'
import type { CutPlan } from './cutlist'
import { speciesName } from './format'

/** Excel на Windows без BOM читает кириллицу как кракозябры. Добавляется в момент скачивания. */
export const CSV_BOM = '﻿'

export interface CsvOptions {
  readonly locale: Locale
  /** Точка с запятой: русская локаль Excel считает запятую десятичным разделителем. */
  readonly delimiter?: string
}

const HEADER = ['kind', 'panel', 'index', 'species', 'width_mm', 'length_mm', 'thickness_mm', 'row'] as const

function cell(value: string | number, delimiter: string): string {
  const text = typeof value === 'number' ? String(Number(value.toFixed(2))) : value
  return /["\r\n]/.test(text) || text.includes(delimiter) ? `"${text.replace(/"/g, '""')}"` : text
}

/**
 * Плоская таблица для цеха: одна строка на полосу и одна на поперечный рез.
 * Всё в миллиметрах: CSV уезжает в Excel и в станки, а не человеку на чтение,
 * поэтому дюймовое представление здесь было бы вредным.
 */
export function cutPlanToCsv(plan: CutPlan, options: CsvOptions): string {
  const delimiter = options.delimiter ?? ';'
  const rows: Array<readonly (string | number)[]> = [HEADER]

  for (const panel of plan.panels) {
    for (const piece of panel.pieces) {
      rows.push(
        piece.kind === 'strip'
          ? ['strip', panel.panelId, piece.elementIndex + 1, speciesName(piece.speciesId, options.locale), piece.widthMm, panel.lengthMm, panel.planedThicknessMm, '']
          : ['inlay', panel.panelId, piece.elementIndex + 1, piece.sourcePanelId, piece.thicknessMm, panel.lengthMm, panel.planedThicknessMm, ''],
      )
    }
    panel.crosscuts.forEach((cut, index) => {
      rows.push(['crosscut', panel.panelId, index + 1, plan.designName, panel.widthMm, '', cut.thicknessMm, cut.rowNumber ?? 'inlay'])
    })
  }

  return rows.map((row) => row.map((v) => cell(v, delimiter)).join(delimiter)).join('\r\n')
}
