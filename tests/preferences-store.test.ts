import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const { createPreferencesStore, normalize } = require('../electron/preferences/preferences-store.cjs') as {
  createPreferencesStore: (directory: string, options?: { platform?: string }) => {
    read: () => any
    patch: (value: unknown) => any
  }
  normalize: (value: unknown) => any
}

const directories: string[] = []
const directory = () => {
  const value = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-preferences-'))
  directories.push(value)
  return value
}

afterEach(() => {
  for (const value of directories.splice(0)) fs.rmSync(value, { recursive: true, force: true })
})

describe('preferences background presets', () => {
  it('migrates v1 preferences and supplies empty global presets', () => {
    expect(normalize({ schemaVersion: 1, theme: 'dark' })).toMatchObject({
      schemaVersion: 3,
      theme: 'dark',
      backgroundPresets: { colors: [], gradients: [] },
      recordingInteractions: { enabled: false, noticeDismissed: false },
    })
  })

  it('normalizes valid presets and deduplicates equivalent values', () => {
    const value = normalize({
      backgroundPresets: {
        colors: ['#ABCDEF', '#abcdef', '#123456'],
        gradients: [
          { type: 'linear', angle: 450, stops: [{ id: 'a', position: 1, color: '#FFFFFF', alpha: 2 }, { id: 'b', position: 0, color: '#000000', alpha: -1 }] },
          { type: 'linear', angle: 90, stops: [{ id: 'b', position: 0, color: '#000000', alpha: 0 }, { id: 'a', position: 1, color: '#ffffff', alpha: 1 }] },
        ],
      },
    })
    expect(value.backgroundPresets).toEqual({
      colors: ['#abcdef', '#123456'],
      gradients: [{ type: 'linear', angle: 90, stops: [{ id: 'b', position: 0, color: '#000000', alpha: 0 }, { id: 'a', position: 1, color: '#ffffff', alpha: 1 }] }],
    })
  })

  it('rejects malformed presets without discarding valid existing preferences', () => {
    const root = directory(); const store = createPreferencesStore(path.join(root, 'preferences.json'))
    store.patch({ theme: 'dark', backgroundPresets: { colors: ['#111111'], gradients: [] } })
    const result = store.patch({ backgroundPresets: { colors: ['invalid'], gradients: [{ stops: [] }] } })
    expect(result).toMatchObject({ theme: 'dark', backgroundPresets: { colors: [], gradients: [] } })
  })

  it('returns defaults when the on-disk preference file is corrupt or missing', () => {
    const root = directory()
    const store = createPreferencesStore(path.join(root, 'preferences.json'))
    expect(store.read()).toMatchObject({ schemaVersion: 3, backgroundPresets: { colors: [], gradients: [] } })
    fs.writeFileSync(path.join(root, 'preferences.json'), '{broken')
    expect(store.read()).toMatchObject({ schemaVersion: 3, backgroundPresets: { colors: [], gradients: [] } })
  })
})
