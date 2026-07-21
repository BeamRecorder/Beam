const { randomUUID } = require('crypto')
const fs = require('fs')
const path = require('path')
const { pathToFileURL } = require('url')

const mediaKinds = new Set(['video', 'image', 'audio'])
const layerKinds = new Set(['video', 'image', 'audio', 'caption'])
const extensions = { video: new Set(['.mp4', '.webm', '.mov', '.mkv']), image: new Set(['.png', '.jpg', '.jpeg', '.webp']), audio: new Set(['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.webm']) }
const finite = (value) => typeof value === 'number' && Number.isFinite(value)
const validId = (value) => typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value)

function emptyComposition() { return { media: [], layers: [] } }
function transform(value) {
  const next = value || {}
  if (![next.x, next.y, next.width, next.height].every(finite) || next.width <= 0 || next.height <= 0) throw new Error('Transformation de calque invalide')
  return { x: Math.max(0, Math.min(1, next.x)), y: Math.max(0, Math.min(1, next.y)), width: Math.max(.001, Math.min(1, next.width)), height: Math.max(.001, Math.min(1, next.height)) }
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
  return { sentences, style: { color: typeof style.color === 'string' ? style.color : '#ffffff', fontSize: finite(style.fontSize) ? style.fontSize : 42, shadowColor: typeof style.shadowColor === 'string' ? style.shadowColor : '#000000', shadowBlur: finite(style.shadowBlur) ? style.shadowBlur : 4, placement: ['top', 'center', 'bottom'].includes(style.placement) ? style.placement : 'bottom' } }
}
function normalizeComposition(value) {
  if (!value || !Array.isArray(value.media) || !Array.isArray(value.layers)) throw new Error('Composition invalide')
  const media = value.media.map((asset) => {
    if (!asset || !validId(asset.id) || !mediaKinds.has(asset.kind) || typeof asset.name !== 'string' || typeof asset.fileName !== 'string' || path.basename(asset.fileName) !== asset.fileName || !finite(asset.durationMs)) throw new Error('Média invalide')
    return { id: asset.id, kind: asset.kind, name: asset.name.slice(0, 160), fileName: asset.fileName, durationMs: Math.max(0, Math.round(asset.durationMs)), width: finite(asset.width) ? asset.width : null, height: finite(asset.height) ? asset.height : null }
  })
  const ids = new Set(media.map((asset) => asset.id))
  const layers = value.layers.map((layer, order) => {
    if (!layer || !validId(layer.id) || !layerKinds.has(layer.kind) || typeof layer.name !== 'string' || !finite(layer.startMs) || !finite(layer.endMs) || layer.endMs < layer.startMs || typeof layer.enabled !== 'boolean') throw new Error('Calque invalide')
    if (layer.kind === 'caption') return { id: layer.id, kind: 'caption', name: layer.name.slice(0, 160), startMs: Math.round(layer.startMs), endMs: Math.round(layer.endMs), enabled: layer.enabled, order, caption: caption(layer.caption) }
    if (!validId(layer.assetId) || !ids.has(layer.assetId)) throw new Error('Le média du calque est introuvable')
    return { id: layer.id, kind: layer.kind, name: layer.name.slice(0, 160), startMs: Math.round(layer.startMs), endMs: Math.round(layer.endMs), enabled: layer.enabled, order, assetId: layer.assetId, transform: layer.kind === 'audio' ? undefined : transform(layer.transform) }
  })
  return { media, layers }
}

function createCompositionStore({ directoryFor, readManifest, writeManifest }) {
  const read = (id) => normalizeComposition(readManifest(directoryFor(id)).editor?.composition || emptyComposition())
  const materialize = (directory, composition) => ({ ...composition, media: composition.media.map((asset) => ({ ...asset, src: pathToFileURL(path.join(directory, 'media', asset.fileName)).href })) })
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
  const upsertLayer = (id, layer) => { const composition = read(id); const index = composition.layers.findIndex((item) => item.id === layer.id); const next = normalizeComposition({ media: composition.media, layers: index < 0 ? [...composition.layers, layer] : composition.layers.map((item, i) => i === index ? layer : item) }); return save(id, next).layers.find((item) => item.id === layer.id) }
  const removeLayer = (id, layerId) => { const composition = read(id); const layer = composition.layers.find((item) => item.id === layerId); if (!layer) throw new Error('Calque introuvable'); composition.layers = composition.layers.filter((item) => item.id !== layerId); if (layer.assetId && !composition.layers.some((item) => item.assetId === layer.assetId)) { const asset = composition.media.find((item) => item.id === layer.assetId); if (asset) { fs.rmSync(path.join(directoryFor(id), 'media', asset.fileName), { force: true }); composition.media = composition.media.filter((item) => item.id !== asset.id) } } return save(id, composition) }
  const moveLayer = (id, layerId, targetIndex) => { const composition = read(id); const index = composition.layers.findIndex((item) => item.id === layerId); if (index < 0 || !Number.isInteger(targetIndex)) throw new Error('Déplacement de calque invalide'); const [layer] = composition.layers.splice(index, 1); const compatible = composition.layers.filter((item) => (item.kind === 'audio') === (layer.kind === 'audio')); const position = Math.max(0, Math.min(compatible.length, targetIndex)); const anchor = compatible[position]; composition.layers.splice(anchor ? composition.layers.indexOf(anchor) : composition.layers.length, 0, layer); return save(id, composition) }
  return { read: response, save, importMedia, upsertLayer, removeLayer, moveLayer }
}

module.exports = { createCompositionStore, emptyComposition, normalizeComposition }
