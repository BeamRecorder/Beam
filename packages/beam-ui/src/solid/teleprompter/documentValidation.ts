import type { TeleprompterDocument } from './teleprompterTypes'
import { utf8ByteLength } from './textEncoding'

export function validateDocument(value: TeleprompterDocument, validateText = true): void {
  if (value.schemaVersion !== 1) throw new Error('Unsupported teleprompter document version')
  if (validateText && (typeof value.text !== 'string' || utf8ByteLength(value.text) > 48 * 1024)) throw new Error('Script limit: 48 KiB')
  validateNumbers(value)
  if (typeof value.textColor !== 'string' || !/^#[\da-f]{8}$/i.test(value.textColor)) throw new Error('Text color must be #RRGGBBAA')
  if (value.useThemeTextColor != null && typeof value.useThemeTextColor !== 'boolean') throw new Error('Invalid teleprompter theme text color setting')
  validateChoices(value)
  if (!Number.isFinite(Date.parse(value.updatedAtUtc))) throw new Error('Invalid teleprompter timestamp')
}

function validateNumbers(value: TeleprompterDocument): void {
  if (!Number.isInteger(value.fontSize) || value.fontSize < 16 || value.fontSize > 96) throw new Error('Font size must be 16–96')
  for (const [name, number, min, max] of [
    ['speed', value.scrollSpeed, 5, 200],
    ['line height', value.lineHeight, 1, 2.5],
    ['window opacity', value.windowOpacity, 0.1, 1],
  ] as const) {
    if (!Number.isFinite(number) || number < min || number > max) throw new Error(`Invalid teleprompter ${name}`)
  }
}

function validateChoices(value: TeleprompterDocument): void {
  if (value.mode !== 'continuous' && value.mode !== 'line-by-line') throw new Error('Invalid teleprompter mode')
  if (typeof value.autoscroll !== 'boolean') throw new Error('Invalid teleprompter autoscroll setting')
  if (value.textAlign !== 'left' && value.textAlign !== 'center') throw new Error('Invalid teleprompter text alignment')
  if (!['system', 'light', 'dark'].includes(value.theme)) throw new Error('Invalid teleprompter theme')
}
