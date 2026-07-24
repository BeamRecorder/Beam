import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { createUserPaths } = require('../electron/storage/user-paths.cjs') as { createUserPaths: (videos: string) => Record<string, string> }
const { createBackgroundLibrary } = require('../electron/backgrounds/background-library.cjs') as { createBackgroundLibrary: (paths: Record<string, string>) => { list: () => Array<{ kind: string; path: string; fileName: string }>; importFile: (source: string) => { kind: string; path: string; fileName: string } } }
const { createProjectStore } = require('../electron/projects/project-store.cjs') as { createProjectStore: (root: string) => { create: (options: { name: string }) => { id: string }; list: () => Array<{ id: string; name: string }>; rename: (id: string, name: string) => { name: string }; saveEditorState: (id: string, state: unknown) => unknown } }

const roots: string[] = []
const temporary = () => { const root = fs.mkdtempSync(path.join(os.tmpdir(), 'demorecorder-user-')); roots.push(root); return root }
afterEach(() => { vi.restoreAllMocks(); for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }) })

describe('user storage paths', () => {
  it('resolves the complete user hierarchy without creating it', () => {
    const videos = temporary(); const paths = createUserPaths(videos)
    expect(paths.preferences).toBe(path.join(videos, 'DemoRecorder', 'user', 'preferences.json'))
    expect(paths.projects).toBe(path.join(videos, 'DemoRecorder', 'user', 'projects'))
    expect(fs.existsSync(paths.user)).toBe(false)
  })

  it('works when the hierarchy is partially present', () => {
    const paths = createUserPaths(temporary()); fs.mkdirSync(paths.projects, { recursive: true })
    expect(createProjectStore(paths.projects).list()).toEqual([])
    expect(fs.existsSync(paths.wallpapers)).toBe(false)
  })

  it('keeps an already complete hierarchy untouched until data is written', () => {
    const paths = createUserPaths(temporary()); fs.mkdirSync(paths.whisperModels, { recursive: true })
    expect(createBackgroundLibrary(paths).list()).toEqual([])
    expect(fs.existsSync(paths.whisperModels)).toBe(true)
  })
})

describe('global background library', () => {
  it('imports valid media globally and lists it', () => {
    const root = temporary(); const source = path.join(root, 'sky.PNG'); fs.writeFileSync(source, 'image')
    const library = createBackgroundLibrary(createUserPaths(root)); const item = library.importFile(source)
    expect(item.kind).toBe('image'); expect(item.path).toMatch(/^file:/); expect(library.list()).toHaveLength(1)
  })

  it('rejects unsupported extensions', () => {
    const root = temporary(); const source = path.join(root, 'sky.txt'); fs.writeFileSync(source, 'no')
    expect(() => createBackgroundLibrary(createUserPaths(root)).importFile(source)).toThrow('Type de fond non autorisé')
  })

  it('uses distinct files for same-name imports', () => {
    const root = temporary(); const first = path.join(root, 'one', 'sky.png'); const second = path.join(root, 'two', 'sky.png'); fs.mkdirSync(path.dirname(first), { recursive: true }); fs.mkdirSync(path.dirname(second), { recursive: true }); fs.writeFileSync(first, 'a'); fs.writeFileSync(second, 'b')
    const library = createBackgroundLibrary(createUserPaths(root)); expect(library.importFile(first).fileName).not.toBe(library.importFile(second).fileName)
  })
})

describe('slugged projects', () => {
  it('finds projects by manifest UUID in readable slug folders', () => {
    const root = temporary(); const store = createProjectStore(root); const first = store.create({ name: 'Vivid Cosmic' }); const second = store.create({ name: 'Vivid Cosmic' })
    expect(fs.existsSync(path.join(root, 'project-vivid-cosmic'))).toBe(true); expect(fs.existsSync(path.join(root, 'project-vivid-cosmic-2'))).toBe(true)
    expect(store.list().map((project) => project.id)).toEqual(expect.arrayContaining([first.id, second.id]))
  })

  it('transliterates accented project titles', () => {
    const root = temporary(); createProjectStore(root).create({ name: 'Été déjà vu' })
    expect(fs.existsSync(path.join(root, 'project-ete-deja-vu'))).toBe(true)
  })

  it('renames the directory immediately and defers a locked move to startup', () => {
    const root = temporary(); const store = createProjectStore(root); const project = store.create({ name: 'First' }); store.rename(project.id, 'Second')
    expect(fs.existsSync(path.join(root, 'project-second'))).toBe(true)
    const rename = vi.spyOn(fs, 'renameSync').mockImplementationOnce(() => { throw new Error('locked') })
    store.rename(project.id, 'Third'); rename.mockRestore()
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'project-second', 'project.json'), 'utf8')); expect(manifest.pendingDirectorySlug).toBe('third')
    createProjectStore(root); expect(fs.existsSync(path.join(root, 'project-third'))).toBe(true)
  })

  it('persists a global background reference without copying it into the project', () => {
    const root = temporary(); const store = createProjectStore(root); const project = store.create({ name: 'Background' })
    store.saveEditorState(project.id, {
      schemaVersion: 1, composition: { media: [], layers: [] }, zoom: { elements: [], generatedSessions: [] },
      presentation: { canvas: { preset: '16:9', width: 1920, height: 1080, showBackground: true }, selectedBackgroundId: 'user-wallpaper:image:global.png', background: null, blurPercent: 0, importedBackgrounds: [{ id: 'ignored', name: 'Ignored', path: 'file:///ignored.png', extension: 'png', kind: 'image' }], videoEnabled: true, systemAudioEnabled: true, micAudioEnabled: true },
    })
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'project-background', 'project.json'), 'utf8'))
    expect(manifest.editor.presentation.selectedBackgroundId).toBe('user-wallpaper:image:global.png')
    expect(manifest.editor.presentation.importedBackgrounds).toEqual([])
  })
})
