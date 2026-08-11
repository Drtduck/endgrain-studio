import type { Design, RowId } from '@/lib/engine'

/** Движок отдаёт nextPanelId, но не nextRowId: та же логика для рядов живёт здесь. */
export function nextRowId(design: Design): RowId {
  const taken = new Set(design.rows.map((r) => r.id))
  let n = design.rows.length + 1
  while (taken.has(`r${n}`)) n += 1
  return `r${n}`
}
