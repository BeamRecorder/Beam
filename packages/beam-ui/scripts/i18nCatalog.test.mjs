import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import ts from 'typescript'
import { flattenMessages } from './i18nCatalog.mjs'

const editorRoot = fileURLToPath(new URL('../src/solid/editor/', import.meta.url))
const editorMessages = JSON.parse(readFileSync(join(editorRoot, 'shared/messages.json'), 'utf8'))
function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? sourceFiles(path) : /\.tsx?$/.test(path) && !path.includes('.test') ? [path] : []
  })
}

test('every literal native editor label exists in each authored locale', () => {
  let checked = 0
  for (const path of sourceFiles(editorRoot)) {
    const content = readFileSync(path, 'utf8')
    if (!content.includes("useTR('NativeEditor')")) continue
    const source = ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    function visit(node) {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'TR'
          && node.arguments[0] && ts.isStringLiteralLike(node.arguments[0])) {
        const key = node.arguments[0].text
        for (const [locale, messages] of Object.entries(editorMessages))
          assert.equal(typeof messages[key], 'string', `${locale}: missing NativeEditor-${key} used by ${path}`)
        checked++
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
  assert.ok(checked > 100, 'the check must inspect actual editor label calls')
})

test('cursor choices resolve generated labels in all shipped locales', () => {
  const generated = JSON.parse(readFileSync(new URL('../src/solid/shared/i18n/catalogs.generated.json', import.meta.url), 'utf8'))
  const keys = ['blur', 'cursorAutomatic', 'cursorSmoothing',
    ...['all', 'bottom', 'bottom-right', 'top-left'].map(value => `shadow-${value}`),
    ...['none', 'single', 'double', 'solid'].map(value => `ripple-${value}`),
    'focused', 'smooth', 'custom', 'leftClick', 'rightClick', 'color', 'borderColor']
  assert.equal(Object.keys(generated.catalogs).length, 15)
  for (const [locale, catalog] of Object.entries(generated.catalogs)) {
    for (const key of keys) assert.equal(typeof catalog[`NativeEditor-${key}`], 'string', `${locale}: missing NativeEditor-${key}`)
  }
  assert.equal(generated.catalogs.fr['NativeEditor-blur'], 'Flou')
  assert.equal(generated.catalogs.en['NativeEditor-blur'], 'Blur')
})

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
