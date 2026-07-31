const { randomUUID } = require('crypto')
const fs = require('fs')
const path = require('path')
const { fileURLToPath, pathToFileURL } = require('url')
const { kindFor } = require('../backgrounds/background-library.cjs')
const {
  emptyComposition,
  normalizeComposition,
  materializeComposition,
  importMedia,
  pruneProjectMedia,
} = require('./clip-composition.cjs')

function createProjectStore(root) {
  const safePath = (directory, relativePath) => {
    if (typeof relativePath !== 'string' || !relativePath) return null
    const resolvedRoot = path.resolve(directory)
    const candidate = path.resolve(resolvedRoot, relativePath)
    return candidate === resolvedRoot || candidate.startsWith(`${resolvedRoot}${path.sep}`) ? candidate : null
  }
  const assertId = (id) => {
    if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new Error('Identifiant de projet invalide')
    return id
  }
  const slugify = (value) => {
    const normalized = String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    return normalized.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'untitled-project'
  }
  const readManifest = (directory) => JSON.parse(fs.readFileSync(path.join(directory, 'project.json'), 'utf8'))
  const writeManifest = (directory, manifest) => {
    const target = path.join(directory, 'project.json')
    fs.writeFileSync(`${target}.tmp`, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
    fs.renameSync(`${target}.tmp`, target)
  }
  const projectDirectories = () => !fs.existsSync(root) ? [] : fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(root, entry.name))
    .filter((directory) => fs.existsSync(path.join(directory, 'project.json')))
  const directoryFor = (id) => {
    const projectId = assertId(id)
    const directory = projectDirectories().find((candidate) => {
      try { return readManifest(candidate).projectId === projectId } catch { return false }
    })
    if (!directory) throw new Error('Projet introuvable')
    return directory
  }
  const sessionFileFor = (directory, sessionId, sessionPath) => {
    const project = readManifest(directory)
    const session = Array.isArray(project.sessions) ? project.sessions.find((entry) => entry?.sessionId === sessionId) : null
    const sessionDirectory = session && safePath(directory, session.relativePath)
    return sessionDirectory ? safePath(sessionDirectory, sessionPath) : null
  }
  const availableDirectory = (name, currentDirectory = null) => {
    const base = `project-${slugify(name)}`
    for (let suffix = 1; suffix <= 2_147_483_647; suffix += 1) {
      const candidate = path.join(root, suffix === 1 ? base : `${base}-${suffix}`)
      if (candidate === currentDirectory || !fs.existsSync(candidate)) return candidate
    }
    throw new Error('Impossible de créer un dossier de projet unique')
  }
  const thumbnailFor = (directory) => {
    for (const file of ['thumbnail.webp', 'thumbnail.png', 'thumbnail.jpg', 'thumbnail.jpeg']) {
      const target = path.join(directory, file)
      if (fs.existsSync(target)) return pathToFileURL(target).href
    }
    return null
  }
  const mediaUrlFor = (fileUrl) => {
    if (typeof fileUrl !== 'string') return null
    let file
    try { file = fileURLToPath(fileUrl) } catch { return null }
    const relativePath = path.relative(root, file)
    const safeFile = safePath(root, relativePath)
    return safeFile && safeFile === path.resolve(file) && fs.existsSync(safeFile) && fs.statSync(safeFile).isFile() ? `project-media://asset/${encodeURIComponent(relativePath.split(path.sep).join('/'))}` : null
  }
  const mediaFileForUrl = (mediaUrl) => {
    let parsed
    try { parsed = new URL(mediaUrl) } catch { return null }
    if (parsed.protocol !== 'project-media:' || parsed.hostname !== 'asset') return null
    let relativePath
    try { relativePath = decodeURIComponent(parsed.pathname.slice(1)) } catch { return null }
    const file = safePath(root, relativePath)
    return file && fs.existsSync(file) && fs.statSync(file).isFile() ? file : null
  }
  const previewFor = (directory, sessions) => {
    for (const session of [...sessions].reverse()) {
      const sessionDirectory = safePath(directory, session.relativePath)
      const screenDirectory = sessionDirectory && path.join(sessionDirectory, 'screen')
      const video = screenDirectory && fs.existsSync(screenDirectory) && fs.readdirSync(screenDirectory).filter((name) => /\.mp4$/i.test(name)).sort()[0]
      if (video) {
        const fileUrl = pathToFileURL(path.join(screenDirectory, video)).href
        return mediaUrlFor(fileUrl) || fileUrl
      }
    }
    return null
  }
  const summary = (directory, manifest, fallbackId) => {
    const sessions = Array.isArray(manifest.sessions) ? manifest.sessions : []
    const id = typeof manifest.projectId === 'string' ? manifest.projectId : fallbackId
    return {
      id,
      name: typeof manifest.name === 'string' && manifest.name.trim() ? manifest.name.trim() : `Project ${id.slice(0, 8)}`,
      createdAt: typeof manifest.createdAtUtc === 'string' ? manifest.createdAtUtc : '',
      updatedAt: typeof manifest.updatedAtUtc === 'string' ? manifest.updatedAtUtc : '',
      sessionCount: sessions.length,
      previewSrc: previewFor(directory, sessions),
      thumbnailSrc: thumbnailFor(directory),
    }
  }
  const zoomState = (value) => {
    if (!value || !Array.isArray(value.elements) || !Array.isArray(value.generatedSessions)) return { elements: [], generatedSessions: [] }
    const ids = new Set()
    const elements = value.elements.map((element) => {
      if (!element || typeof element.id !== 'string' || !element.id || ids.has(element.id) || typeof element.sessionId !== 'string' || !Number.isFinite(element.startMs) || !Number.isFinite(element.endMs) || element.endMs <= element.startMs || !element.focus || !Number.isFinite(element.focus.cx) || !Number.isFinite(element.focus.cy) || element.focus.cx < 0 || element.focus.cx > 1 || element.focus.cy < 0 || element.focus.cy > 1 || ![1, 2, 3, 4, 5, 6].includes(element.depth) || !['auto', 'manual'].includes(element.mode)) throw new Error('Propriétés de zoom invalides')
      ids.add(element.id)
      return { id: element.id, sessionId: element.sessionId, startMs: Math.round(element.startMs), endMs: Math.round(element.endMs), focus: { cx: element.focus.cx, cy: element.focus.cy }, depth: element.depth, mode: element.mode }
    })
    const generatedSessions = value.generatedSessions.map((record) => {
      if (!record || typeof record.sessionId !== 'string' || !record.sessionId || !Number.isInteger(record.algorithmVersion) || typeof record.generatedAt !== 'string') throw new Error('Métadonnées de génération invalides')
      return { sessionId: record.sessionId, algorithmVersion: record.algorithmVersion, generatedAt: record.generatedAt }
    })
    return { elements, generatedSessions }
  }
  const defaultCursorEffects = () => ({
    left: { springEnabled: true, springIntensity: 50, rippleEnabled: true, rippleSize: 30, rippleColor: '#ff5a1f' },
    right: { springEnabled: true, springIntensity: 50, rippleEnabled: true, rippleSize: 30, rippleColor: '#6366f1' },
  })
  const cursorEffectState = (value, fallback) => {
    const input = value && typeof value === 'object' ? value : {}
    const number = (candidate, defaultValue, min, max) => Number.isFinite(candidate) ? Math.max(min, Math.min(max, candidate)) : defaultValue
    const boolean = (candidate, defaultValue) => typeof candidate === 'boolean' ? candidate : defaultValue
    const color = (candidate, defaultValue) => typeof candidate === 'string' && candidate ? candidate : defaultValue
    return {
      springEnabled: boolean(input.springEnabled, fallback.springEnabled),
      springIntensity: number(input.springIntensity, fallback.springIntensity, 0, 100),
      rippleEnabled: boolean(input.rippleEnabled, fallback.rippleEnabled),
      rippleSize: number(input.rippleSize, fallback.rippleSize, 10, 80),
      rippleColor: color(input.rippleColor, fallback.rippleColor),
    }
  }
  const cursorEffectsState = (value) => {
    const defaults = defaultCursorEffects()
    const input = value && typeof value === 'object' ? value : {}
    return {
      left: cursorEffectState(input.left, defaults.left),
      right: cursorEffectState(input.right, defaults.right),
    }
  }
  const presentationState = (value) => {
    const next = value || {}
    const canvasInput = next.canvas || {}
    const preset = ['16:9', '9:16', '1:1', '4:5', 'custom'].includes(canvasInput.preset) ? canvasInput.preset : '16:9'
    const presets = { '16:9': [1920, 1080], '9:16': [1080, 1920], '1:1': [1080, 1080], '4:5': [1080, 1350] }
    const [presetWidth, presetHeight] = presets[preset] || []
    const width = preset === 'custom' ? Math.max(1, Math.round(canvasInput.width)) : presetWidth
    const height = preset === 'custom' ? Math.max(1, Math.round(canvasInput.height)) : presetHeight
    if (!Number.isFinite(width) || !Number.isFinite(height)) throw new Error('Dimensions du canvas invalides')
    return {
      canvas: { preset, width, height, showBackground: typeof canvasInput.showBackground === 'boolean' ? canvasInput.showBackground : true },
      selectedBackgroundId: typeof next.selectedBackgroundId === 'string' ? next.selectedBackgroundId : null,
      background: next.background && typeof next.background === 'object' ? next.background : null,
      blurPercent: Number.isFinite(next.blurPercent) ? Math.max(0, Math.min(100, Math.round(next.blurPercent))) : 0,
      importedBackgrounds: Array.isArray(next.importedBackgrounds) ? next.importedBackgrounds.filter((item) => item && typeof item.id === 'string' && typeof item.path === 'string') : [],
      cursorEffects: cursorEffectsState(next.cursorEffects),
    }
  }
  const readJsonArray = (file) => {
    if (!fs.existsSync(file)) return null
    try { const parsed = JSON.parse(fs.readFileSync(file, 'utf8')); return Array.isArray(parsed) ? parsed : null } catch { return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).flatMap((line) => { try { return [JSON.parse(line)] } catch { return [] } }) }
  }
  const telemetryFor = (file) => {
    if (!fs.existsSync(file)) return []
    try { return (JSON.parse(fs.readFileSync(file, 'utf8'))?.samples || []).filter((sample) => sample && Number.isFinite(sample.timeMs) && Number.isFinite(sample.cx) && Number.isFinite(sample.cy)).map((sample) => ({ timeMs: Math.max(0, sample.timeMs), cx: Math.max(0, Math.min(1, sample.cx)), cy: Math.max(0, Math.min(1, sample.cy)), interactionType: ['move', 'click', 'double-click', 'right-click', 'middle-click', 'mouseup'].includes(sample.interactionType) ? sample.interactionType : undefined, cursorType: typeof sample.cursorType === 'string' ? sample.cursorType : undefined })).sort((a, b) => a.timeMs - b.timeMs) } catch { return [] }
  }
  const editorData = (id) => {
    const directory = directoryFor(id)
    const manifest = readManifest(directory)
    const sessions = Array.isArray(manifest.sessions) ? manifest.sessions : []
    for (const session of [...sessions].reverse()) {
      const sessionDirectory = safePath(directory, session.relativePath)
      if (!sessionDirectory || !fs.existsSync(sessionDirectory)) continue
      const manifestPath = [path.join(sessionDirectory, 'manifest.json'), path.join(sessionDirectory, 'manifest.partial.json')].find(fs.existsSync)
      if (!manifestPath) continue
      let sessionManifest
      try { sessionManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) } catch { continue }
      const screenDirectory = path.join(sessionDirectory, 'screen')
      const video = fs.existsSync(screenDirectory) && fs.readdirSync(screenDirectory).filter((name) => /\.mp4$/i.test(name)).sort()[0]
      const tracks = Array.isArray(sessionManifest.tracks) ? sessionManifest.tracks.map((track) => ({
        ...track,
        assets: Array.isArray(track.segments) ? track.segments.map((segment) => {
          const assetPath = safePath(sessionDirectory, segment.path)
          return { ...segment, src: assetPath && fs.existsSync(assetPath) ? pathToFileURL(assetPath).href : null, exists: Boolean(assetPath && fs.existsSync(assetPath)) }
        }) : [],
      })) : []
      const cursorDirectory = path.join(sessionDirectory, 'cursor')
      const events = readJsonArray(path.join(cursorDirectory, 'cursor.json'))
      let metadata = {}
      try { metadata = JSON.parse(fs.readFileSync(path.join(cursorDirectory, 'shapes.json'), 'utf8')) || {} } catch {}
      const catalog = Object.fromEntries(Object.entries(metadata).filter(([, value]) => value && typeof value === 'object' && typeof value.cursorKind === 'string' && typeof value.nativeCursorId === 'string').map(([cursorId, value]) => [cursorId, { cursorKind: value.cursorKind, nativeCursorId: value.nativeCursorId, hotspot: value.hotspot || { x: 0, y: 0 } }]))
      const shapes = Object.fromEntries(Object.entries(metadata).flatMap(([shapeId, value]) => { const shapePath = path.join(cursorDirectory, 'shapes', `${shapeId}.png`); return fs.existsSync(shapePath) ? [[shapeId, { src: pathToFileURL(shapePath).href, hotspot: value?.hotspot || value || { x: 0, y: 0 } }]] : [] }))
      const missing = Object.keys(metadata).filter((shapeId) => !catalog[shapeId] && !shapes[shapeId]).map((shapeId) => `shapes/${shapeId}.png`)
      return { sessionId: session.sessionId, manifest: sessionManifest, videoSrc: video ? pathToFileURL(path.join(screenDirectory, video)).href : null, tracks, cursor: { available: Array.isArray(events), events: events || [], telemetry: telemetryFor(path.join(cursorDirectory, 'telemetry.json')), shapes, catalog, missing: [...(Array.isArray(events) ? [] : ['cursor.json']), ...missing] }, zoom: manifest.editor?.zoom ? zoomState(manifest.editor.zoom) : { elements: [], generatedSessions: [] } }
    }
    return null
  }
  const generatedBaseName = (id) => {
    const adjectives = ['Bright', 'Calm', 'Clever', 'Golden', 'Quiet', 'Rapid', 'Soft', 'Vivid']
    const nouns = ['Aurora', 'Canvas', 'Comet', 'Horizon', 'Orbit', 'Pixel', 'Signal', 'Studio']
    return `${adjectives[Number.parseInt(id.slice(0, 2), 16) % adjectives.length]} ${nouns[Number.parseInt(id.slice(2, 4), 16) % nouns.length]}`
  }
  const generatedName = (id) => {
    const baseName = generatedBaseName(id)
    const names = new Set(projectDirectories().flatMap((directory) => { try { return [readManifest(directory).name] } catch { return [] } }))
    if (!names.has(baseName)) return baseName
    for (let suffix = 2; suffix <= 2_147_483_647; suffix += 1) if (!names.has(`${baseName} ${suffix}`)) return `${baseName} ${suffix}`
    throw new Error('Impossible de générer un nom de projet unique')
  }
  const editorState = (id) => {
    const directory = directoryFor(id)
    const manifest = readManifest(directory)
    const editor = manifest.editor || {}
    const composition = normalizeComposition(editor.composition || emptyComposition())
    return {
      schemaVersion: 2,
      composition: materializeComposition(directory, composition, sessionFileFor),
      zoom: editor.zoom ? zoomState(editor.zoom) : { elements: [], generatedSessions: [] },
      presentation: presentationState(editor.presentation),
    }
  }
  const saveEditorState = (id, value) => {
    if (!value || value.schemaVersion !== 2) throw new Error('État éditeur invalide')
    const directory = directoryFor(id)
    const manifest = readManifest(directory)
    const previous = normalizeComposition(manifest.editor?.composition || emptyComposition())
    const composition = normalizeComposition(value.composition)
    const zoom = zoomState(value.zoom)
    const presentation = presentationState(value.presentation)
    pruneProjectMedia(directory, previous, composition)
    manifest.editor = { composition, zoom, presentation }
    manifest.updatedAtUtc = new Date().toISOString()
    writeManifest(directory, manifest)
    return editorState(id)
  }
  const applyPendingRenames = () => {
    for (const directory of projectDirectories()) {
      let manifest
      try { manifest = readManifest(directory) } catch { continue }
      if (typeof manifest.pendingDirectorySlug !== 'string' || !manifest.pendingDirectorySlug) continue
      const target = availableDirectory(manifest.pendingDirectorySlug, directory)
      try { fs.renameSync(directory, target); delete manifest.pendingDirectorySlug; writeManifest(target, manifest) } catch {}
    }
  }
  const importBackground = (id, input = {}) => {
    const directory = directoryFor(id)
    const source = input.source
    if (typeof source !== 'string' || !source) throw new Error('Fond importé invalide')
    let sourceStats
    try { sourceStats = fs.statSync(source) } catch { throw new Error('Fond importé invalide') }
    if (!sourceStats.isFile()) throw new Error('Fond importé invalide')
    const extension = path.extname(source).toLowerCase()
    const kind = kindFor(source)
    if (!kind) throw new Error('Type de fond non autorisé')
    const targetDirectory = path.join(directory, 'backgrounds')
    fs.mkdirSync(targetDirectory, { recursive: true })
    const fileName = `${randomUUID()}${extension}`
    const targetPath = path.join(targetDirectory, fileName)
    fs.copyFileSync(source, targetPath)
    return { id: `project-bg:${fileName}`, name: path.basename(source, extension).slice(0, 160), fileName, extension: extension.slice(1), kind, path: pathToFileURL(targetPath).href }
  }

  applyPendingRenames()
  return {
    list: () => projectDirectories().map((directory) => { try { const manifest = readManifest(directory); return summary(directory, manifest, manifest.projectId) } catch { return null } }).filter(Boolean).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))),
    mediaUrlFor,
    mediaFileForUrl,
    directoryFor,
    editorData,
    editorState,
    saveEditorState,
    importEditorMedia: (id, input) => importMedia(directoryFor(id), input),
    importBackground,
    create: (options = {}) => {
      const id = randomUUID()
      const now = new Date().toISOString()
      const name = typeof options.name === 'string' && options.name.trim() ? options.name.trim().slice(0, 80) : generatedName(id)
      fs.mkdirSync(root, { recursive: true })
      const directory = availableDirectory(name)
      fs.mkdirSync(directory)
      const manifest = { schemaVersion: 1, projectId: id, name, createdAtUtc: now, updatedAtUtc: now, sessions: [], editor: { composition: emptyComposition(), zoom: { elements: [], generatedSessions: [] }, presentation: presentationState() } }
      writeManifest(directory, manifest)
      return summary(directory, manifest, id)
    },
    rename: (id, name) => {
      const directory = directoryFor(id)
      const manifest = readManifest(directory)
      const nextName = typeof name === 'string' ? name.trim().slice(0, 80) : ''
      if (!nextName) throw new Error('Le nom du projet ne peut pas être vide')
      const target = availableDirectory(nextName, directory)
      manifest.name = nextName
      manifest.updatedAtUtc = new Date().toISOString()
      try { fs.renameSync(directory, target); delete manifest.pendingDirectorySlug; writeManifest(target, manifest); return summary(target, manifest, id) } catch { manifest.pendingDirectorySlug = slugify(nextName); writeManifest(directory, manifest); return summary(directory, manifest, id) }
    },
    saveThumbnail: (id, dataUrl) => {
      const directory = directoryFor(id)
      if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) return null
      const targetPath = path.join(directory, 'thumbnail.webp')
      fs.writeFileSync(targetPath, Buffer.from(dataUrl.replace(/^data:image\/\w+;base64,/, ''), 'base64'))
      return pathToFileURL(targetPath).href
    },
    delete: (id) => fs.rmSync(directoryFor(id), { recursive: true, force: false }),
  }
}

module.exports = { createProjectStore }
