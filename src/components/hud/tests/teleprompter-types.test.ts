import { describe, expect, it } from 'vitest'
import { clampTeleprompterLine, createDefaultTeleprompterDocument, splitTeleprompterLines } from './teleprompter-types'

describe('teleprompter types', () => {
  it('creates a complete versioned default document', () => {
    const document = createDefaultTeleprompterDocument('2026-01-01T00:00:00.000Z')
    expect(document).toMatchObject({ schemaVersion: 1, mode: 'continuous', autoscroll: true, theme: 'system' })
    expect(document.updatedAtUtc).toBe('2026-01-01T00:00:00.000Z')
  })

  it('normalizes line endings without dropping empty lines', () => {
    expect(splitTeleprompterLines('one\r\ntwo\n')).toEqual(['one', 'two', ''])
    expect(splitTeleprompterLines('')).toEqual([''])
  })

  it('keeps navigation inside the available line bounds', () => {
    expect(clampTeleprompterLine(-2, 3)).toBe(0)
    expect(clampTeleprompterLine(1.8, 3)).toBe(1)
    expect(clampTeleprompterLine(99, 3)).toBe(2)
    expect(clampTeleprompterLine(4, 0)).toBe(0)
  })
})
