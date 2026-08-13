import { describe, it, expect } from 'vitest'
import { ENGINE_VERSION } from './version'
import { SCHEMA_VERSION } from './types'

describe('engine version', () => {
  it('exposes a semver string', () => {
    expect(ENGINE_VERSION).toBe('1.0.0')
    expect(ENGINE_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it('schema version is bumped for the angled cut support', () => {
    expect(SCHEMA_VERSION).toBe(3)
  })
})
