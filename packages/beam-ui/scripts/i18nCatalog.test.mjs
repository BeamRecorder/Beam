import assert from 'node:assert/strict'
import test from 'node:test'
import { flattenMessages } from './i18nCatalog.mjs'

test('flattens selected namespaces into valid hyphenated Fluent message IDs', () => {
  const source = {
    HUD: { title: 'Beam', capture: { 'screen-mode': 'Screen', camera_off: 'Camera off' } },
    Ignored: { invalid: ['not a message'] },
  }
  assert.deepEqual(flattenMessages(source, ['HUD']), {
    'HUD-title': 'Beam',
    'HUD-capture-screen-mode': 'Screen',
    'HUD-capture-camera_off': 'Camera off',
  })
})

test('converts Vue variables to Fluent while preserving their names and source messages', () => {
  const message = 'Stop ({time}): {count2} frames from {device_name}; {time}'
  const source = { HUD: { stop: message } }
  assert.deepEqual(flattenMessages(source, ['HUD']), {
    'HUD-stop': 'Stop ({ $time }): { $count2 } frames from { $device_name }; { $time }',
  })
  assert.equal(source.HUD.stop, message)
})

test('rejects collisions between a hyphenated key and a nested message path', () => {
  assert.throws(
    () => flattenMessages({ HUD: { 'a-b': 'Flat', a: { b: 'Nested' } } }, ['HUD']),
    /Duplicate message ID: HUD-a-b/,
  )
})

test('escapes literal braces as Fluent string expressions without escaping variables', () => {
  assert.deepEqual(flattenMessages({ HUD: {
    braces: 'Use {} and { notVariable } with {time}',
    unbalanced: 'Closing } then opening {',
  } }, ['HUD']), {
    'HUD-braces': 'Use { "{" }{ "}" } and { "{" } notVariable { "}" } with { $time }',
    'HUD-unbalanced': 'Closing { "}" } then opening { "{" }',
  })
})

test('reports missing namespaces and invalid Fluent IDs explicitly', () => {
  assert.throws(() => flattenMessages({}, ['HUD']), /Missing namespace: HUD/)
  assert.throws(
    () => flattenMessages({ '9HUD': { title: 'Beam' } }, ['9HUD']),
    /Invalid message ID: 9HUD-title/,
  )
  assert.throws(
    () => flattenMessages({ HUD: { 'bad.key': 'Invalid' } }, ['HUD']),
    /Invalid message ID: HUD-bad\.key/,
  )
})

test('reports non-string leaves and array groups instead of silently dropping them', () => {
  for (const value of [null, false, 42, [], ['not a message']]) {
    assert.throws(
      () => flattenMessages({ HUD: { item: value } }, ['HUD']),
      /Message must be a string or group: HUD\.item/,
    )
  }
})

test('rejects Vue plural alternatives regardless of separator spacing', () => {
  for (const message of [
    'One item | {count} items',
    'One item|{count} items',
    'One item |{count} items',
    'One item| {count} items',
  ]) {
    assert.throws(
      () => flattenMessages({ HUD: { count: message } }, ['HUD']),
      /Convert Vue plural rules to Fluent: HUD-count/,
    )
  }
})
