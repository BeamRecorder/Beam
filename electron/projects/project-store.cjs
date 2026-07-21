const { randomUUID } = require('crypto')
const fs = require('fs')
const path = require('path')
const { pathToFileURL } = require('url')
const { createCompositionStore } = require('./composition-store.cjs')

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
  const composition = createCompositionStore({ directoryFor, readManifest, writeManifest })
  return {
    list: () => !fs.existsSync(root) ? [] : fs.readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory() && entry.name.startsWith('project-')).map((entry) => { try { const directory = path.join(root, entry.name); return summary(directory, readManifest(directory), entry.name.slice(8)) } catch { return null } }).filter(Boolean).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))),
    editorData,
    saveZoom: (id, zoom) => { const directory = directoryFor(id); const manifest = readManifest(directory); const state = zoomState(zoom); manifest.editor = { ...(manifest.editor || {}), zoom: state }; manifest.updatedAtUtc = new Date().toISOString(); writeManifest(directory, manifest); return state },
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
