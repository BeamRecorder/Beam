import type { ShortcutKeyEvent } from './shortcutTypes'

const modifiers = new Set(['Shift', 'Control', 'Alt', 'Super', 'Meta', 'AltGraph'])
const aliases: Record<string, string> = { ' ': 'Space', '+': 'Equal', '=': 'Equal', '-': 'Minus' }

/** Converts a completed native key chord to an ARGUI accelerator. */
export function shortcutFromEvent(event: ShortcutKeyEvent): string | null {
  if (event.state !== 'pressed' || event.repeat || modifiers.has(event.key) || event.key === 'Escape') return null
  const key = aliases[event.key] ?? (event.key.length === 1 ? event.key.toUpperCase() : event.key)
  if (!/^[A-Za-z0-9]+$/.test(key)) return null
  return [event.control && 'Control', event.alt && 'Alt', event.shift && 'Shift', event.super && 'Super', key]
    .filter(Boolean).join('+')
}

/** Splits saved accelerators into the same key caps used by the shortcut editor. */
export function shortcutKeys(value: string): string[] {
  return value.split('+').filter(Boolean).map(key => key.replace(/^Key(?=[A-Z]$)/, '').replace(/^Digit(?=\d$)/, ''))
}
