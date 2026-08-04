const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const { createPreferencesStore } = require('../../electron/preferences/preferences-store.cjs')

test('writes durable generic preferences and merges patches', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-preferences-'))
  const store = createPreferencesStore(directory)
  const saved = store.patch({
    theme: 'dark',
    shortcuts: { 'hud.startStopRecording': { keys: 'Ctrl+Shift+R', scope: 'global', category: 'hud' } },
    extras: { futureFlag: true },
  })
  assert.equal(saved.theme, 'dark')
  assert.equal(saved.shortcuts['hud.startStopRecording'].keys, 'Ctrl+Shift+R')
  assert.equal(saved.extras.futureFlag, true)
  assert.deepEqual(store.read(), saved)
  assert.ok(fs.existsSync(path.join(directory, 'preferencesSettings.json')))
})

test('rejects duplicate global shortcuts', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-preferences-'))
  const store = createPreferencesStore(directory)
  assert.throws(
    () =>
      store.write({
        ...store.read(),
        shortcuts: {
          a: { keys: 'Ctrl+F', scope: 'global', category: 'hud' },
          b: { keys: 'Ctrl+F', scope: 'global', category: 'hud' },
        },
      }),
    /dupliqué/,
  )
})
