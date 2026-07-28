const { randomUUID } = require('crypto')
const fs = require('fs')
const path = require('path')
const { pathToFileURL } = require('url')

const mediaKinds = new Set(['video', 'image', 'audio'])
const layerKinds = new Set(['video', 'image', 'audio', 'caption'])
const extensions = { video: new Set(['.mp4', '.webm', '.mov', '.mkv']), image: new Set(['.png', '.jpg', '.jpeg', '.webp']), audio: new Set(['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.webm']) }
const finite = (value) => typeof value === 'number' && Number.isFinite(value)
const validId = (value) => typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value)
const validColor = (value) => typeof value === 'string' && /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(value)

function emptyComposition() { return { media: [], layers: [] } }
function transform(value) {
  const next = value || {}
  if (![next.x, next.y, next.width, next.height].every(finite) || next.width <= 0 || next.height <= 0) throw new Error('Transformation de calque invalide')
  return { x: Math.max(-3, Math.min(3, next.x)), y: Math.max(-3, Math.min(3, next.y)), width: Math.max(.001, Math.min(4, next.width)), height: Math.max(.001, Math.min(4, next.height)) }
}
function caption(value) {
  if (!value || !Array.isArray(value.sentences)) throw new Error('Captions invalides')
  const sentences = value.sentences.map((sentence) => {
    if (!sentence || typeof sentence.id !== 'string' || !Array.isArray(sentence.words)) throw new Error('Phrase de caption invalide')
    const words = sentence.words.map((word) => {
      if (!word || typeof word.text !== 'string' || !finite(word.startMs) || !finite(word.endMs) || word.endMs < word.startMs) throw new Error('Mot de caption invalide')
      return { text: word.text, startMs: Math.max(0, Math.round(word.startMs)), endMs: Math.max(0, Math.round(word.endMs)) }
    })
    return { id: sentence.id, text: typeof sentence.text === 'string' ? sentence.text : words.map((word) => word.text).join(' '), startMs: words[0]?.startMs ?? 0, endMs: words.at(-1)?.endMs ?? 0, words }
  })
  const style = value.style || {}
  return {
    sentences,
    style: {
      color: typeof style.color === 'string' ? style.color : '#ffffff',
      fontSize: finite(style.fontSize) ? style.fontSize : 36,
      boxColor: typeof style.boxColor === 'string' ? style.boxColor : '#000000',
      boxPadding: finite(style.boxPadding) ? style.boxPadding : 6,
      boxRadius: finite(style.boxRadius) ? style.boxRadius : 4,
      shadowColor: typeof style.shadowColor === 'string' ? style.shadowColor : 'rgba(0, 0, 0, 0.85)',
      shadowBlur: finite(style.shadowBlur) ? style.shadowBlur : 0,
      shadowDirection: typeof style.shadowDirection === 'string' ? style.shadowDirection : 'bottom-right',
      placement: ['top', 'center', 'bottom'].includes(style.placement) ? style.placement : 'bottom',
      ...(typeof style.customText === 'string' ? { customText: style.customText } : {}),
      ...(typeof style.backdropBlur === 'number' ? { backdropBlur: style.backdropBlur } : {}),
      ...(finite(style.shadowOffsetX) ? { shadowOffsetX: style.shadowOffsetX } : {}),
      ...(finite(style.shadowOffsetY) ? { shadowOffsetY: style.shadowOffsetY } : {}),
    }
  }
}
function webcamAppearance(value) {
  if (!value || !['none', 'sm', 'md', 'lg'].includes(value.shadowSize)) return undefined
  const cornerRadius = finite(value.cornerRadius)
    ? Math.max(0, Math.min(9_999, Math.round(value.cornerRadius)))
    : ['none', 'sm', 'md', 'lg', 'full'].includes(value.cornerRadius)
      ? value.cornerRadius
      : undefined
  if (cornerRadius === undefined) return undefined
  return { shadowSize: value.shadowSize, cornerRadius }
}
function clipAppearance(value) {
  const base = webcamAppearance(value)
  if (!base) return undefined
  return { ...base, shadowColor: validColor(value.shadowColor) ? value.shadowColor : '#000000', shadowDirection: ['all', 'bottom', 'bottom-right', 'top-left'].includes(value.shadowDirection) ? value.shadowDirection : 'all', borderEnabled: value.borderEnabled === true, borderColor: validColor(value.borderColor) ? value.borderColor : '#000000', borderWidth: finite(value.borderWidth) ? Math.max(1, Math.min(32, Math.round(value.borderWidth))) : 1, frame: ['none', 'safari', 'windows-95'].includes(value.frame) ? value.frame : 'none', frameTitle: typeof value.frameTitle === 'string' ? value.frameTitle.slice(0, 120) : '', frameColor: validColor(value.frameColor) ? value.frameColor : '#c0c0c0', frameShowMenu: value.frameShowMenu !== false, frameShowScrollbars: value.frameShowScrollbars !== false }
}
function normalizeComposition(value) {
  if (!value || !Array.isArray(value.media) || !Array.isArray(value.layers)) throw new Error('Composition invalide')
  const media = value.media.map((asset) => {
    if (!asset || !validId(asset.id) || !mediaKinds.has(asset.kind) || typeof asset.name !== 'string' || !finite(asset.durationMs)) throw new Error('Média invalide')
    const origin = asset.origin === 'session' ? 'session' : 'project'
    if (origin === 'project' && (typeof asset.fileName !== 'string' || path.basename(asset.fileName) !== asset.fileName)) throw new Error('Média invalide')
    if (origin === 'session' && (!validId(asset.sessionId) || typeof asset.sessionPath !== 'string' || !asset.sessionPath || path.isAbsolute(asset.sessionPath) || asset.sessionPath.split(/[\\/]+/).includes('..'))) throw new Error('Média de session invalide')
    return { id: asset.id, kind: asset.kind, name: asset.name.slice(0, 160), fileName: origin === 'project' ? asset.fileName : null, durationMs: Math.max(0, Math.round(asset.durationMs)), width: finite(asset.width) ? asset.width : null, height: finite(asset.height) ? asset.height : null, origin, ...(origin === 'session' ? { sessionId: asset.sessionId, sessionPath: asset.sessionPath } : {}) }
  })
  const ids = new Set(media.map((asset) => asset.id))
  const layers = value.layers.map((layer, order) => {
    if (!layer || !validId(layer.id) || !layerKinds.has(layer.kind) || typeof layer.name !== 'string' || !finite(layer.startMs) || !finite(layer.endMs) || layer.endMs < layer.startMs || typeof layer.enabled !== 'boolean') throw new Error('Calque invalide')
    if (layer.kind === 'caption') {
      const tr = layer.transform ? transform(layer.transform) : undefined
      return {
        id: layer.id,
        kind: 'caption',
        name: layer.name.slice(0, 160),
        startMs: Math.round(layer.startMs),
        endMs: Math.round(layer.endMs),
        enabled: layer.enabled,
        order,
        caption: caption(layer.caption),
        ...(tr ? { transform: tr } : {}),
        ...(typeof layer.isAiGenerated === 'boolean' ? { isAiGenerated: layer.isAiGenerated } : {})
      }
    }
    if (!validId(layer.assetId) || !ids.has(layer.assetId)) throw new Error('Le média du calque est introuvable')
    const webcam = layer.kind === 'video' ? webcamAppearance(layer.webcamAppearance) : undefined
    const appearance = layer.kind !== 'audio' ? clipAppearance(layer.appearance) : undefined
    return {
      id: layer.id, kind: layer.kind, name: layer.name.slice(0, 160), startMs: Math.round(layer.startMs), endMs: Math.round(layer.endMs), enabled: layer.enabled, order, assetId: layer.assetId,
      ...(typeof layer.groupId === 'string' && validId(layer.groupId) ? { groupId: layer.groupId } : {}),
      ...(layer.kind === 'audio' ? {} : { transform: transform(layer.transform) }),
      ...(['video', 'audio'].includes(layer.kind) && finite(layer.sourceOffsetMs) && layer.sourceOffsetMs >= 0 ? { sourceOffsetMs: Math.round(layer.sourceOffsetMs) } : {}),
      ...(['video', 'audio'].includes(layer.kind) && finite(layer.playbackRate) && layer.playbackRate >= .25 && layer.playbackRate <= 4 ? { playbackRate: layer.playbackRate } : {}),
      ...(layer.kind === 'audio' && finite(layer.volume) ? { volume: Math.max(0, Math.min(200, layer.volume)) } : {}),
      ...(layer.kind !== 'audio' && layer.crop ? { crop: transform(layer.crop) } : {}),
      ...(layer.kind !== 'audio' && typeof layer.isMirrored === 'boolean' ? { isMirrored: layer.isMirrored } : {}),
      ...(layer.kind === 'video' && typeof layer.reactToZoom === 'boolean' ? { reactToZoom: layer.reactToZoom } : {}), ...(webcam ? { webcamAppearance: webcam } : {}), ...(appearance ? { appearance } : {})
    }
  })
  const baseVideoAppearance = clipAppearance(value.baseVideoAppearance)
  const baseVideoCrop = value.baseVideoCrop ? transform(value.baseVideoCrop) : undefined
  const baseVideoTransform = value.baseVideoTransform ? transform(value.baseVideoTransform) : undefined
  const sessionSegments = Array.isArray(value.sessionSegments)
    ? value.sessionSegments.filter((segment) => segment && typeof segment.id === 'string' && segment.id.length > 0 && segment.id.length <= 160 && finite(segment.sourceStartMs) && finite(segment.sourceEndMs) && segment.sourceStartMs >= 0 && segment.sourceEndMs > segment.sourceStartMs && typeof segment.active === 'boolean').map((segment) => {
      const sourceStartMs = Math.round(segment.sourceStartMs)
      const sourceEndMs = Math.round(segment.sourceEndMs)
      const activeStartMs = finite(segment.activeStartMs) ? Math.max(sourceStartMs, Math.min(sourceEndMs - 1, Math.round(segment.activeStartMs))) : undefined
      const activeEndMs = finite(segment.activeEndMs) ? Math.max((activeStartMs ?? sourceStartMs) + 1, Math.min(sourceEndMs, Math.round(segment.activeEndMs))) : undefined
      return {
        id: segment.id, sourceStartMs, sourceEndMs, active: segment.active,
        ...(activeStartMs !== undefined ? { activeStartMs } : {}),
        ...(activeEndMs !== undefined ? { activeEndMs } : {}),
        ...(finite(segment.playbackRate) && segment.playbackRate >= .25 && segment.playbackRate <= 4 ? { playbackRate: segment.playbackRate } : {}),
        ...(clipAppearance(segment.appearance) ? { appearance: clipAppearance(segment.appearance) } : {}),
      }
    })
    : []
  const cameraLayerIds = new Set(layers.filter((layer) => layer.kind === 'video' && layer.reactToZoom).map((layer) => layer.id))
  const visualLayerIds = layers.filter((layer) => (layer.kind === 'video' || layer.kind === 'image') && !cameraLayerIds.has(layer.id)).sort((a, b) => a.order - b.order).map((layer) => layer.id)
  const validVisualIds = new Set(['base-video', ...visualLayerIds, ...(cameraLayerIds.size ? ['webcam'] : [])])
  const fallbackVisualOrder = [...visualLayerIds, ...(cameraLayerIds.size ? ['webcam'] : []), 'base-video']
  const requestedVisualOrder = Array.isArray(value.visualTrackOrder) ? value.visualTrackOrder : fallbackVisualOrder
  const visualTrackOrder = []
  for (const trackId of requestedVisualOrder) {
    if (typeof trackId === 'string' && validVisualIds.has(trackId) && !visualTrackOrder.includes(trackId)) visualTrackOrder.push(trackId)
  }
  for (const trackId of fallbackVisualOrder) if (!visualTrackOrder.includes(trackId)) visualTrackOrder.push(trackId)
  const detachedSessionSidecars = Array.isArray(value.detachedSessionSidecars)
    ? [...new Set(value.detachedSessionSidecars.filter((sidecar) => ['camera', 'system-audio', 'microphone'].includes(sidecar)))]
    : []
  return { media, layers, visualTrackOrder, ...(baseVideoAppearance ? { baseVideoAppearance } : {}), ...(baseVideoCrop ? { baseVideoCrop } : {}), ...(baseVideoTransform ? { baseVideoTransform } : {}), ...(typeof value.baseVideoIsMirrored === 'boolean' ? { baseVideoIsMirrored: value.baseVideoIsMirrored } : {}), ...(finite(value.baseVideoPlaybackRate) && value.baseVideoPlaybackRate >= .25 && value.baseVideoPlaybackRate <= 4 ? { baseVideoPlaybackRate: value.baseVideoPlaybackRate } : {}), ...(sessionSegments.length ? { sessionSegments } : {}), ...(detachedSessionSidecars.length ? { detachedSessionSidecars } : {}) }
}

function createCompositionStore({ directoryFor, readManifest, writeManifest, sessionDirectoryFor }) {
  const read = (id) => normalizeComposition(readManifest(directoryFor(id)).editor?.composition || emptyComposition())
  const materialize = (directory, composition) => ({ ...composition, media: composition.media.map((asset) => { const target = asset.origin === 'session' ? sessionDirectoryFor?.(directory, asset.sessionId, asset.sessionPath) : path.join(directory, 'media', asset.fileName); return { ...asset, src: target && fs.existsSync(target) ? pathToFileURL(target).href : '' } }) })
  const save = (id, value) => { const directory = directoryFor(id); const manifest = readManifest(directory); const composition = normalizeComposition(value); manifest.editor = { ...(manifest.editor || {}), composition }; manifest.updatedAtUtc = new Date().toISOString(); writeManifest(directory, manifest); return materialize(directory, composition) }
  const response = (id) => { const directory = directoryFor(id); return materialize(directory, read(id)) }
  const importMedia = (id, input) => {
    if (!input || typeof input.source !== 'string' || !mediaKinds.has(input.kind)) throw new Error('Import de média invalide')
    const extension = path.extname(input.source).toLowerCase()
    if (!extensions[input.kind].has(extension)) throw new Error('Type de média non autorisé')
    const directory = directoryFor(id); const targetDirectory = path.join(directory, 'media'); fs.mkdirSync(targetDirectory, { recursive: true })
    const asset = { id: randomUUID(), kind: input.kind, name: path.basename(input.source, extension), fileName: `${randomUUID()}${extension}`, durationMs: Math.max(0, Math.round(input.durationMs || 0)), width: finite(input.width) ? input.width : null, height: finite(input.height) ? input.height : null }
    fs.copyFileSync(input.source, path.join(targetDirectory, asset.fileName))
    const composition = read(id); composition.media.push(asset); save(id, composition)
    return { ...asset, src: pathToFileURL(path.join(targetDirectory, asset.fileName)).href }
  }
  return { read: response, save, importMedia }
}

module.exports = { createCompositionStore, emptyComposition, normalizeComposition }
