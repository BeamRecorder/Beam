const { randomUUID } = require('crypto')
const fs = require('fs')
const path = require('path')
const { pathToFileURL } = require('url')
const { createCompositionStore, normalizeComposition } = require('./composition-store.cjs')

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
  const directoryFor = (id) => path.join(root, `project-${assertId(id)}`)
  const readManifest = (directory) => JSON.parse(fs.readFileSync(path.join(directory, 'project.json'), 'utf8'))
  const writeManifest = (directory, manifest) => {
    const target = path.join(directory, 'project.json')
    fs.writeFileSync(`${target}.tmp`, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
    fs.renameSync(`${target}.tmp`, target)
  }
  const thumbnailFor = (directory) => {
    const candidates = ['thumbnail.webp', 'thumbnail.png', 'thumbnail.jpg', 'thumbnail.jpeg']
    for (const file of candidates) {
      const target = path.join(directory, file)
      if (fs.existsSync(target)) return pathToFileURL(target).href
    }
    return null
  }
  const previewFor = (directory, sessions) => {
    for (const session of [...sessions].reverse()) {
      const sessionDirectory = safePath(directory, session.relativePath)
      const screenDirectory = sessionDirectory && path.join(sessionDirectory, 'screen')
      const video = screenDirectory && fs.existsSync(screenDirectory) && fs.readdirSync(screenDirectory).filter((name) => /\.mp4$/i.test(name)).sort()[0]
      if (video) return pathToFileURL(path.join(screenDirectory, video)).href
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
    if (!value || !Array.isArray(value.elements) || !Array.isArray(value.generatedSessions)) throw new Error('État des zooms invalide')
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
  const presentationState = (value) => {
    const next = value || {}
    const canvasInput = next.canvas || {}
    const preset = ['16:9', '9:16', '1:1', '4:5', 'custom'].includes(canvasInput.preset) ? canvasInput.preset : '16:9'
    const presets = { '16:9': [1920, 1080], '9:16': [1080, 1920], '1:1': [1080, 1080], '4:5': [1080, 1350] }
    const [presetWidth, presetHeight] = presets[preset] || []
    const width = preset === 'custom' ? Math.max(1, Math.round(canvasInput.width)) : presetWidth
    const height = preset === 'custom' ? Math.max(1, Math.round(canvasInput.height)) : presetHeight
    if (!Number.isFinite(width) || !Number.isFinite(height)) throw new Error('Dimensions du canvas invalides')
    const importedBackgrounds = Array.isArray(next.importedBackgrounds) ? next.importedBackgrounds.map((background) => {
      if (!background || typeof background.id !== 'string' || typeof background.name !== 'string' || typeof background.fileName !== 'string' || path.basename(background.fileName) !== background.fileName || !['image', 'video'].includes(background.kind)) throw new Error('Fond importé invalide')
      return { id: background.id, name: background.name.slice(0, 160), fileName: background.fileName, kind: background.kind }
    }) : []
    return {
      canvas: { preset, width, height, showBackground: typeof canvasInput.showBackground === 'boolean' ? canvasInput.showBackground : canvasInput.fit === 'cover' ? false : true },
      selectedBackgroundId: typeof next.selectedBackgroundId === 'string' ? next.selectedBackgroundId : null,
      importedBackgrounds,
      videoEnabled: typeof next.videoEnabled === 'boolean' ? next.videoEnabled : true,
      systemAudioEnabled: typeof next.systemAudioEnabled === 'boolean' ? next.systemAudioEnabled : true,
      micAudioEnabled: typeof next.micAudioEnabled === 'boolean' ? next.micAudioEnabled : true,
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
    const directory = directoryFor(id); const manifest = readManifest(directory); const sessions = Array.isArray(manifest.sessions) ? manifest.sessions : []
    for (const session of [...sessions].reverse()) {
      const sessionDirectory = safePath(directory, session.relativePath)
      if (!sessionDirectory || !fs.existsSync(sessionDirectory)) continue
      const manifestPath = [path.join(sessionDirectory, 'manifest.json'), path.join(sessionDirectory, 'manifest.partial.json')].find(fs.existsSync)
      if (!manifestPath) continue
      let sessionManifest; try { sessionManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) } catch { continue }
      const screenDirectory = path.join(sessionDirectory, 'screen')
      const video = fs.existsSync(screenDirectory) && fs.readdirSync(screenDirectory).filter((name) => /\.mp4$/i.test(name)).sort()[0]
      const tracks = Array.isArray(sessionManifest.tracks) ? sessionManifest.tracks.map((track) => ({ ...track, assets: Array.isArray(track.segments) ? track.segments.map((segment) => { const assetPath = safePath(sessionDirectory, segment.path); return { ...segment, src: assetPath && fs.existsSync(assetPath) ? pathToFileURL(assetPath).href : null, exists: Boolean(assetPath && fs.existsSync(assetPath)) } }) : [] })) : []
      const cursorDirectory = path.join(sessionDirectory, 'cursor'); const events = readJsonArray(path.join(cursorDirectory, 'cursor.json')); let metadata = {}
      try { metadata = JSON.parse(fs.readFileSync(path.join(cursorDirectory, 'shapes.json'), 'utf8')) || {} } catch {}
      const shapes = Object.fromEntries(Object.entries(metadata).flatMap(([shapeId, value]) => { const shapePath = path.join(cursorDirectory, 'shapes', `${shapeId}.png`); return fs.existsSync(shapePath) ? [[shapeId, { src: pathToFileURL(shapePath).href, hotspot: value?.hotspot || value || { x: 0, y: 0 } }]] : [] }))
      return { sessionId: session.sessionId, manifest: sessionManifest, videoSrc: video ? pathToFileURL(path.join(screenDirectory, video)).href : null, tracks, cursor: { available: Array.isArray(events), events: events || [], telemetry: telemetryFor(path.join(cursorDirectory, 'telemetry.json')), shapes, missing: [...(Array.isArray(events) ? [] : ['cursor.json']), ...Object.keys(metadata).filter((shapeId) => !shapes[shapeId]).map((shapeId) => `shapes/${shapeId}.png`)] }, zoom: manifest.editor?.zoom ? zoomState(manifest.editor.zoom) : { elements: [], generatedSessions: [] } }
    }
    return null
  }
  const generatedBaseName = (id) => { const adjectives = ['Bright', 'Calm', 'Clever', 'Golden', 'Quiet', 'Rapid', 'Soft', 'Vivid']; const nouns = ['Aurora', 'Canvas', 'Comet', 'Horizon', 'Orbit', 'Pixel', 'Signal', 'Studio']; return `${adjectives[Number.parseInt(id.slice(0, 2), 16) % adjectives.length]} ${nouns[Number.parseInt(id.slice(2, 4), 16) % nouns.length]}` }
  const generatedName = (id) => {
    const baseName = generatedBaseName(id)
    const names = new Set(!fs.existsSync(root) ? [] : fs.readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory() && entry.name.startsWith('project-')).flatMap((entry) => { try { return [readManifest(path.join(root, entry.name)).name] } catch { return [] } }))
    if (!names.has(baseName)) return baseName
    for (let attempts = 0; attempts < 100; attempts += 1) {
      const suffix = Math.floor(Math.random() * 2_147_483_647) + 1
      const candidate = `${baseName} ${suffix}`
      if (!names.has(candidate)) return candidate
    }
    for (let suffix = 1; suffix <= 2_147_483_647; suffix += 1) {
      const candidate = `${baseName} ${suffix}`
      if (!names.has(candidate)) return candidate
    }
    throw new Error('Impossible de générer un nom de projet unique')
  }
  const composition = createCompositionStore({ directoryFor, readManifest, writeManifest, sessionDirectoryFor: (directory, sessionId, sessionPath) => {
    const project = readManifest(directory)
    const session = Array.isArray(project.sessions) ? project.sessions.find((entry) => entry?.sessionId === sessionId) : null
    const sessionDirectory = session && safePath(directory, session.relativePath)
    return sessionDirectory ? safePath(sessionDirectory, sessionPath) : null
  } })
  const editorState = (id) => {
    const directory = directoryFor(id); const manifest = readManifest(directory); const editor = manifest.editor || {}
    const presentation = presentationState(editor.presentation)
    return { schemaVersion: 1, composition: composition.read(id), zoom: editor.zoom ? zoomState(editor.zoom) : { elements: [], generatedSessions: [] }, presentation: { ...presentation, importedBackgrounds: presentation.importedBackgrounds.map((background) => ({ ...background, extension: path.extname(background.fileName).slice(1).toLowerCase(), path: pathToFileURL(path.join(directory, 'media', 'backgrounds', background.fileName)).href })) } }
  }
  const saveEditorState = (id, value) => {
    if (!value || value.schemaVersion !== 1) throw new Error('État éditeur invalide')
    const directory = directoryFor(id); const manifest = readManifest(directory)
    const nextComposition = normalizeComposition(value.composition)
    const nextZoom = zoomState(value.zoom)
    const nextPresentation = presentationState(value.presentation)
    manifest.editor = { ...(manifest.editor || {}), composition: nextComposition, zoom: nextZoom, presentation: nextPresentation }
    manifest.updatedAtUtc = new Date().toISOString(); writeManifest(directory, manifest)
    return editorState(id)
  }
  const importBackground = (id, input) => {
    if (!input || typeof input.source !== 'string') throw new Error('Fond importé invalide')
    const extension = path.extname(input.source).toLowerCase(); const kind = ['.mp4', '.webm', '.mov', '.m4v', '.ogv'].includes(extension) ? 'video' : ['.png', '.jpg', '.jpeg', '.webp', '.avif', '.bmp'].includes(extension) ? 'image' : null
    if (!kind) throw new Error('Type de fond non autorisé')
    const directory = directoryFor(id); const targetDirectory = path.join(directory, 'media', 'backgrounds'); fs.mkdirSync(targetDirectory, { recursive: true })
    const background = { id: randomUUID(), name: path.basename(input.source, extension).slice(0, 160), fileName: `${randomUUID()}${extension}`, kind }
    fs.copyFileSync(input.source, path.join(targetDirectory, background.fileName))
    return { ...background, extension: extension.slice(1), path: pathToFileURL(path.join(targetDirectory, background.fileName)).href }
  }
  return {
    list: () => !fs.existsSync(root) ? [] : fs.readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory() && entry.name.startsWith('project-')).map((entry) => { try { const directory = path.join(root, entry.name); return summary(directory, readManifest(directory), entry.name.slice(8)) } catch { return null } }).filter(Boolean).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))),
    editorData,
    saveZoom: (id, zoom) => { const directory = directoryFor(id); const manifest = readManifest(directory); const state = zoomState(zoom); manifest.editor = { ...(manifest.editor || {}), zoom: state }; manifest.updatedAtUtc = new Date().toISOString(); writeManifest(directory, manifest); return state },
    editorState,
    saveEditorState,
    importBackground,
    create: (options = {}) => { const id = randomUUID(); const now = new Date().toISOString(); const name = typeof options.name === 'string' && options.name.trim() ? options.name.trim().slice(0, 80) : generatedName(id); fs.mkdirSync(root, { recursive: true }); const directory = directoryFor(id); fs.mkdirSync(directory); const manifest = { schemaVersion: 1, projectId: id, name, createdAtUtc: now, updatedAtUtc: now, sessions: [] }; writeManifest(directory, manifest); return summary(directory, manifest, id) },
    rename: (id, name) => { const directory = directoryFor(id); const manifest = readManifest(directory); const nextName = typeof name === 'string' ? name.trim().slice(0, 80) : ''; if (!nextName) throw new Error('Le nom du projet ne peut pas être vide'); manifest.name = nextName; manifest.updatedAtUtc = new Date().toISOString(); writeManifest(directory, manifest); return summary(directory, manifest, id) },
    saveThumbnail: (id, dataUrl) => {
      const directory = directoryFor(id);
      if (!fs.existsSync(directory)) return null;
      if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) return null;
      const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      const targetPath = path.join(directory, 'thumbnail.webp');
      fs.writeFileSync(targetPath, buffer);
      return pathToFileURL(targetPath).href;
    },
    composition: (id) => composition.read(id),
    saveComposition: (id, value) => composition.save(id, value),
    importCompositionMedia: (id, input) => composition.importMedia(id, input),
    saveCompositionLayer: (id, layer) => composition.upsertLayer(id, layer),
    deleteCompositionLayer: (id, layerId) => composition.removeLayer(id, layerId),
    moveCompositionLayer: (id, layerId, targetIndex) => composition.moveLayer(id, layerId, targetIndex),
    delete: (id) => { const directory = directoryFor(id); if (!fs.existsSync(directory)) throw new Error('Projet introuvable'); fs.rmSync(directory, { recursive: true, force: false }) },
  }
}

module.exports = { createProjectStore }
