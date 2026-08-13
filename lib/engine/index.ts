export { ENGINE_VERSION } from './version'
export * from './types'
export { EngineError, type EngineErrorCode } from './errors'
export {
  clipHalfPlane,
  polygonAreaMm2,
  polygonBbox,
  rectPoly,
  insetConvex,
  polygonsOverlapMm2,
  cellPolygon,
  type Pt,
  type PolyBbox,
} from './geometry'
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
