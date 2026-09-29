import { expect, it } from 'vitest'
import { validateDocument } from './documentValidation'
import { createDefaultTeleprompterDocument } from './teleprompterTypes'

const valid = createDefaultTeleprompterDocument('2026-09-29T12:00:00Z')
it('accepts the inclusive numeric and UTF-8 size boundaries', () => {
  validateDocument({ ...valid, fontSize: 16, scrollSpeed: 5, lineHeight: 1, windowOpacity: 0.1, text: 'é'.repeat(24 * 1024) })
  validateDocument({ ...valid, fontSize: 96, scrollSpeed: 200, lineHeight: 2.5, windowOpacity: 1, textColor: '#AA00ffff',
    mode: 'line-by-line', autoscroll: false, textAlign: 'center', theme: 'light' })
})
it('rejects multibyte scripts above 48 KiB and skips only previously validated text', () => {
  const value = { ...valid, text: 'é'.repeat(24 * 1024 + 1) }
  expect(() => validateDocument(value)).toThrow('48 KiB')
  validateDocument(value, false)
  expect(() => validateDocument({ ...value, scrollSpeed: NaN }, false)).toThrow('speed')
})
it.each([
  ['fontSize', 15], ['fontSize', 97], ['fontSize', 16.5], ['fontSize', NaN],
  ['scrollSpeed', 4], ['scrollSpeed', 201], ['scrollSpeed', Infinity],
  ['lineHeight', 0.9], ['lineHeight', 2.6], ['lineHeight', NaN],
  ['windowOpacity', 0], ['windowOpacity', 1.1], ['windowOpacity', Infinity],
  ['textColor', '#ffffff'], ['textColor', '#ffffggff'], ['textColor', 1],
  ['useThemeTextColor', 'true'], ['useThemeTextColor', 0],
  ['schemaVersion', 2], ['mode', 'invalid'], ['autoscroll', 'true'], ['textAlign', 'right'],
  ['theme', 'invalid'], ['updatedAtUtc', 'invalid'], ['text', 123],
])('rejects an invalid %s value %s', (key, value) => {
  expect(() => validateDocument({ ...valid, [key]: value })).toThrow()
})

it.each([undefined, null, true, false])('accepts a saved theme color choice %s', useThemeTextColor => {
  validateDocument({ ...valid, useThemeTextColor })
})
