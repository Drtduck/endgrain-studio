export { ENGINE_VERSION } from './version'
export * from './types'
export { EngineError, type EngineErrorCode } from './errors'
export {
  isStrip,
  isSliceRef,
  elementExtentMm,
  panelWidthMm,
  findPanel,
  getPanel,
  getElement,
  slicesOfPanel,
  panelLengthMm,
  usageCount,
  nextPanelId,
} from './panels'
export { compile, rowBandsMm, colBandsMm, type RowBand, type ColBand } from './compile'
export { validate, hasErrors, type ValidateOptions } from './validate'
export { baseDesign, stripsPanel } from './fixtures'
export { applyPaint, splitPanel, type PaintCost, type PaintResult } from './edit'
