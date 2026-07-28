const { randomUUID } = require('crypto')
const fs = require('fs')
const path = require('path')
const { pathToFileURL } = require('url')

const schemaVersion = 1
const mediaKinds = new Set(['video', 'image', 'audio'])
const clipKinds = new Set(['screen', 'video', 'image', 'webcam', 'audio', 'caption'])
const extensions = {
  video: new Set(['.mp4', '.webm', '.mov', '.mkv']),
  image: new Set(['.png', '.jpg', '.jpeg', '.webp']),
  audio: new Set(['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.webm']),
}
const finite = (value) => typeof value === 'number' && Number.isFinite(value)
const text = (value, max = 160) => typeof value === 'string' ? value.slice(0, max) : ''
const id = (value) => typeof value === 'string' && value.length > 0 && value.length <= 600
const color = (value, fallback) => typeof value === 'string' && /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(value) ? value : fallback
const emptyComposition = () => ({ schemaVersion, assets: [], clips: [] })

const rectangle = (value, label) => {
  const next = value || {}
  if (![next.x, next.y, next.width, next.height].every(finite) || next.width <= 0 || next.height <= 0) throw new Error(`${label} invalide`)
  return { x: next.x, y: next.y, width: next.width, height: next.height }
}

const appearance = (value) => {
  if (!value) return undefined
  const radius = finite(value.cornerRadius) ? Math.max(0, Math.min(9999, value.cornerRadius)) : ['none', 'sm', 'md', 'lg', 'full'].includes(value.cornerRadius) ? value.cornerRadius : 'sm'
  return {
    cornerRadius: radius,
    shadowSize: ['none', 'sm', 'md', 'lg'].includes(value.shadowSize) ? value.shadowSize : 'md',
    shadowColor: color(value.shadowColor, '#000000'),
    shadowDirection: ['all', 'bottom', 'bottom-right', 'top-left'].includes(value.shadowDirection) ? value.shadowDirection : 'bottom',
    borderEnabled: value.borderEnabled === true,
    borderColor: color(value.borderColor, '#000000'),
    borderWidth: finite(value.borderWidth) ? Math.max(1, Math.min(32, Math.round(value.borderWidth))) : 1,
    frame: ['none', 'safari', 'windows-95'].includes(value.frame) ? value.frame : 'none',
    frameTitle: text(value.frameTitle, 120),
    frameColor: color(value.frameColor, '#c0c0c0'),
    frameShowMenu: value.frameShowMenu !== false,
    frameShowScrollbars: value.frameShowScrollbars !== false,
  }
}

const caption = (value) => {
  if (!value || !Array.isArray(value.sentences)) throw new Error('Caption invalide')
  const sentences = value.sentences.map((sentence) => {
    if (!sentence || !id(sentence.id) || !Array.isArray(sentence.words)) throw new Error('Phrase de caption invalide')
    const words = sentence.words.map((word) => {
      if (!word || typeof word.text !== 'string' || !finite(word.startMs) || !finite(word.endMs) || word.endMs < word.startMs) throw new Error('Mot de caption invalide')
      return { text: word.text, startMs: Math.max(0, Math.round(word.startMs)), endMs: Math.max(0, Math.round(word.endMs)) }
    })
    return {
      id: sentence.id,
      text: typeof sentence.text === 'string' ? sentence.text : words.map((word) => word.text).join(' '),
      startMs: finite(sentence.startMs) ? Math.max(0, Math.round(sentence.startMs)) : words[0]?.startMs ?? 0,
      endMs: finite(sentence.endMs) ? Math.max(0, Math.round(sentence.endMs)) : words.at(-1)?.endMs ?? 0,
      words,
    }
  })
  const style = value.style || {}
  return {
    sentences,
    style: {
      color: typeof style.color === 'string' ? style.color : '#ffffff',
      fontSize: finite(style.fontSize) ? Math.max(1, style.fontSize) : 42,
      shadowColor: typeof style.shadowColor === 'string' ? style.shadowColor : '#000000',
      shadowBlur: finite(style.shadowBlur) ? Math.max(0, style.shadowBlur) : 4,
      placement: ['top', 'center', 'bottom'].includes(style.placement) ? style.placement : 'bottom',
      ...(typeof style.shadowDirection === 'string' ? { shadowDirection: style.shadowDirection } : {}),
      ...(finite(style.shadowOffsetX) ? { shadowOffsetX: style.shadowOffsetX } : {}),
      ...(finite(style.shadowOffsetY) ? { shadowOffsetY: style.shadowOffsetY } : {}),
      ...(finite(style.backdropBlur) ? { backdropBlur: style.backdropBlur } : {}),
      ...(typeof style.boxColor === 'string' ? { boxColor: style.boxColor } : {}),
      ...(finite(style.boxPadding) ? { boxPadding: style.boxPadding } : {}),
      ...(finite(style.boxRadius) ? { boxRadius: style.boxRadius } : {}),
      ...(typeof style.customText === 'string' ? { customText: style.customText } : {}),
    },
  }
}

function normalizeComposition(value) {
  if (!value) return emptyComposition()
  if (value.schemaVersion !== schemaVersion || !Array.isArray(value.assets) || !Array.isArray(value.clips)) return emptyComposition()
  const assetIds = new Set()
  const assets = value.assets.map((asset) => {
    if (!asset || !id(asset.id) || assetIds.has(asset.id) || !mediaKinds.has(asset.kind) || !finite(asset.durationMs)) throw new Error('Média de composition invalide')
    assetIds.add(asset.id)
    const origin = asset.origin === 'session' ? 'session' : 'project'
    if (origin === 'project' && (typeof asset.fileName !== 'string' || path.basename(asset.fileName) !== asset.fileName)) throw new Error('Fichier média invalide')
    if (origin === 'session' && (!id(asset.sessionId) || typeof asset.sessionPath !== 'string' || !asset.sessionPath || path.isAbsolute(asset.sessionPath) || asset.sessionPath.split(/[\\/]+/).includes('..'))) throw new Error('Média de session invalide')
    return {
      id: asset.id,
      kind: asset.kind,
      name: text(asset.name) || 'Media',
      fileName: origin === 'project' ? asset.fileName : null,
      durationMs: Math.max(0, Math.round(asset.durationMs)),
      width: finite(asset.width) ? Math.max(1, Math.round(asset.width)) : null,
      height: finite(asset.height) ? Math.max(1, Math.round(asset.height)) : null,
      origin,
      ...(origin === 'session' ? { sessionId: asset.sessionId, sessionPath: asset.sessionPath } : {}),
    }
  })
  const clipIds = new Set()
  const groups = new Map()
  const clips = value.clips.map((clip, order) => {
    if (!clip || !id(clip.id) || clipIds.has(clip.id) || !clipKinds.has(clip.kind) || typeof clip.enabled !== 'boolean') throw new Error('Clip invalide')
    clipIds.add(clip.id)
    const numbers = [clip.timelineStartMs, clip.timelineDurationMs, clip.sourceInMs, clip.sourceDurationMs, clip.playbackRate]
    if (!numbers.every(finite) || clip.timelineStartMs < 0 || clip.timelineDurationMs < 40 || clip.sourceInMs < 0 || clip.sourceDurationMs <= 0 || clip.playbackRate < .25 || clip.playbackRate > 4 || Math.abs(clip.timelineDurationMs - clip.sourceDurationMs / clip.playbackRate) > 2) throw new Error('Timing de clip invalide')
    const common = {
      id: clip.id,
      kind: clip.kind,
      name: text(clip.name) || 'Clip',
      timelineStartMs: Math.round(clip.timelineStartMs),
      timelineDurationMs: Math.round(clip.timelineDurationMs),
      sourceInMs: Math.round(clip.sourceInMs),
      sourceDurationMs: Math.round(clip.sourceDurationMs),
      playbackRate: clip.playbackRate,
      enabled: clip.enabled,
      order,
      ...(id(clip.groupId) ? { groupId: clip.groupId } : {}),
    }
    if (common.groupId) {
      const key = `${common.timelineStartMs}:${common.timelineDurationMs}:${common.playbackRate}`
      if (groups.has(common.groupId) && groups.get(common.groupId) !== key) throw new Error('Groupe de clips invalide')
      groups.set(common.groupId, key)
    }
    if (clip.kind === 'caption') return { ...common, caption: caption(clip.caption), ...(clip.transform ? { transform: rectangle(clip.transform, 'Transformation') } : {}), ...(typeof clip.isAiGenerated === 'boolean' ? { isAiGenerated: clip.isAiGenerated } : {}) }
    if (!id(clip.assetId) || !assetIds.has(clip.assetId)) throw new Error('Média du clip introuvable')
    if (clip.kind === 'audio') return { ...common, assetId: clip.assetId, role: ['system', 'microphone', 'imported'].includes(clip.role) ? clip.role : 'imported', volume: finite(clip.volume) ? Math.max(0, Math.min(200, clip.volume)) : 100 }
    return {
      ...common,
      assetId: clip.assetId,
      transform: rectangle(clip.transform, 'Transformation'),
      ...(clip.crop ? { crop: rectangle(clip.crop, 'Recadrage') } : {}),
      ...(appearance(clip.appearance) ? { appearance: appearance(clip.appearance) } : {}),
      ...(typeof clip.isMirrored === 'boolean' ? { isMirrored: clip.isMirrored } : {}),
    }
  })
  const groupCounts = new Map()
  for (const clip of clips) if (clip.groupId) groupCounts.set(clip.groupId, (groupCounts.get(clip.groupId) || 0) + 1)
  return { schemaVersion, assets, clips: clips.map((clip) => clip.groupId && groupCounts.get(clip.groupId) < 2 ? { ...clip, groupId: undefined } : clip) }
}

const materializeComposition = (directory, composition, sessionFileFor) => ({
  ...composition,
  assets: composition.assets.map((asset) => {
    const target = asset.origin === 'session' ? sessionFileFor(directory, asset.sessionId, asset.sessionPath) : path.join(directory, 'media', asset.fileName)
    return { ...asset, src: target && fs.existsSync(target) ? pathToFileURL(target).href : '' }
  }),
})

const importMedia = (directory, input) => {
  if (!input || typeof input.source !== 'string' || !mediaKinds.has(input.kind)) throw new Error('Import de média invalide')
  const extension = path.extname(input.source).toLowerCase()
  if (!extensions[input.kind].has(extension)) throw new Error('Type de média non autorisé')
  const targetDirectory = path.join(directory, 'media')
  fs.mkdirSync(targetDirectory, { recursive: true })
  const fileName = `${randomUUID()}${extension}`
  fs.copyFileSync(input.source, path.join(targetDirectory, fileName))
  return {
    id: randomUUID(),
    kind: input.kind,
    name: path.basename(input.source, extension).slice(0, 160),
    fileName,
    durationMs: 0,
    width: null,
    height: null,
    src: pathToFileURL(path.join(targetDirectory, fileName)).href,
    origin: 'project',
  }
}

const pruneProjectMedia = (directory, previous, next) => {
  const used = new Set(next.assets.filter((asset) => asset.origin === 'project').map((asset) => asset.fileName))
  for (const asset of previous.assets || []) {
    if (asset.origin !== 'project' || used.has(asset.fileName)) continue
    fs.rmSync(path.join(directory, 'media', asset.fileName), { force: true })
  }
}

module.exports = { emptyComposition, normalizeComposition, materializeComposition, importMedia, pruneProjectMedia }
