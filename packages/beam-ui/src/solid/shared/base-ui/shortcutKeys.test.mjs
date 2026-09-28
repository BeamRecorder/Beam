import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { shortcutFromEvent, shortcutKeys } from './shortcutKeys.ts'

const pressed = { kind: 'key', key: 'r', state: 'pressed', repeat: false, shift: false, control: false, alt: false, super: false, text: null }

test('native shortcuts encode modifiers and normalize letters', () => {
  assert.equal(shortcutFromEvent({ ...pressed, alt: true, shift: true }), 'Alt+Shift+R')
  assert.equal(shortcutFromEvent({ ...pressed, control: true, super: true }), 'Control+Super+R')
  assert.equal(shortcutFromEvent({ ...pressed, key: 'F8' }), 'F8')
})
test('shortcut capture waits for a key and ignores repeat, release and Escape', () => {
  for (const key of ['Shift', 'Control', 'Alt', 'Super', 'Meta', 'AltGraph', 'Escape'])
    assert.equal(shortcutFromEvent({ ...pressed, key }), null)
  assert.equal(shortcutFromEvent({ ...pressed, repeat: true }), null)
  assert.equal(shortcutFromEvent({ ...pressed, state: 'released' }), null)
})
test('shortcut capture uses valid accelerator names for space and punctuation', () => {
  for (const [key, expected] of [[' ', 'Space'], ['+', 'Equal'], ['=', 'Equal'], ['-', 'Minus']])
    assert.equal(shortcutFromEvent({ ...pressed, key }), expected)
  assert.equal(shortcutFromEvent({ ...pressed, key: 'é' }), null)
})
test('key caps preserve a saved chord and remove physical-key prefixes', () => {
  assert.deepEqual(shortcutKeys('Alt+Shift+KeyR'), ['Alt', 'Shift', 'R'])
  assert.deepEqual(shortcutKeys('Control+Digit8'), ['Control', '8'])
  assert.deepEqual(shortcutKeys(''), [])
})
