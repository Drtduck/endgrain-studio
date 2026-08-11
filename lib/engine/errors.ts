export type EngineErrorCode =
  | 'PANEL_NOT_FOUND'
  | 'ELEMENT_NOT_FOUND'
  | 'SPLIT_OUT_OF_RANGE'
  | 'PAINT_TARGET_NOT_STRIP'
  | 'UNKNOWN_SPECIES'

export class EngineError extends Error {
  readonly code: EngineErrorCode

  constructor(code: EngineErrorCode, message: string) {
    super(message)
    this.name = 'EngineError'
    this.code = code
  }
}
