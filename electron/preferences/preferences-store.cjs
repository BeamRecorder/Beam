const fs = require('fs')
const path = require('path')

const defaults = () => ({
  schemaVersion: 2,
  theme: 'light',
  recordingBar: { visibility: 'always' },
  devices: {},
  shortcuts: {
    'hud.startStopRecording': { keys: 'Alt+Shift+R', scope: 'global', category: 'hud' },
    'hud.playPause': { keys: 'Alt+Shift+P', scope: 'global', category: 'hud' },
    'hud.toggleMic': { keys: 'Alt+Shift+M', scope: 'global', category: 'hud' },
    'hud.toggleCamera': { keys: 'Alt+Shift+C', scope: 'global', category: 'hud' },
    'hud.toggleSystemAudio': { keys: 'Alt+Shift+A', scope: 'global', category: 'hud' },
    'editor.playPause': { keys: 'Space', scope: 'application', category: 'video-editor' },
    'teleprompter.toggleVisibility': { keys: 'Alt+Shift+T', scope: 'global', category: 'teleprompter' },
    'teleprompter.toggleAutoscroll': { keys: 'Alt+Shift+O', scope: 'global', category: 'teleprompter' },
    'teleprompter.nextLine': { keys: 'Ctrl+Shift+Right', scope: 'global', category: 'teleprompter' },
    'teleprompter.previousLine': { keys: 'Ctrl+Shift+Left', scope: 'global', category: 'teleprompter' },
  },
  backgroundPresets: { colors: [], gradients: [] },
  extras: {},
})
const themes = new Set(['light', 'dark', 'system'])
const scopes = new Set(['global', 'application'])
const shortcut = (value) =>
  value &&
  typeof value.keys === 'string' &&
  value.keys.length > 0 &&
  value.keys.length <= 80 &&
  scopes.has(value.scope) &&
  typeof value.category === 'string' &&
  value.category.length > 0
const color = (value) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
const clamp = (value) => Math.max(0, Math.min(1, value))
const gradient = (value) => {
  if (!value || typeof value !== 'object' || !Array.isArray(value.stops) || value.stops.length < 2) return null
  const stops = value.stops.map((stop, index) => {
    if (!stop || typeof stop !== 'object' || !color(stop.color)) return null
    const position = Number(stop.position)
    const alpha = Number(stop.alpha)
    return {
      id: typeof stop.id === 'string' && stop.id ? stop.id.slice(0, 80) : `stop-${index}`,
      position: clamp(Number.isFinite(position) ? position : index / Math.max(1, value.stops.length - 1)),
      color: stop.color.toLowerCase(),
      alpha: clamp(Number.isFinite(alpha) ? alpha : 1),
    }
  })
  if (stops.some((stop) => stop === null)) return null
  const angle = Number(value.angle)
  return {
    type: value.type === 'radial' ? 'radial' : 'linear',
    angle: Number.isFinite(angle) ? ((angle % 360) + 360) % 360 : 135,
    stops: stops.sort((left, right) => left.position - right.position),
  }
}
const presets = (value) => {
  const raw = value && typeof value === 'object' ? value : {}
  const colors = Array.isArray(raw.colors)
    ? [...new Set(raw.colors.filter(color).map((item) => item.toLowerCase()))]
    : []
  const gradients = Array.isArray(raw.gradients) ? raw.gradients.map(gradient).filter(Boolean) : []
  const uniqueGradients = [...new Map(gradients.map((item) => [JSON.stringify(item), item])).values()]
  return { colors, gradients: uniqueGradients }
}
const normalize = (value) => {
  const base = defaults()
  const next = value && typeof value === 'object' ? value : {}
  const providedShortcuts =
    next.shortcuts && typeof next.shortcuts === 'object'
      ? Object.fromEntries(
          Object.entries(next.shortcuts).flatMap(([id, entry]) =>
            typeof id === 'string' && shortcut(entry)
              ? [[id, { keys: entry.keys, scope: entry.scope, category: entry.category }]]
              : [],
          ),
        )
      : {}
  const shortcuts = { ...base.shortcuts, ...providedShortcuts }
  const globalKeys = new Set()
  for (const entry of Object.values(shortcuts)) {
    if (entry.scope === 'global') {
      const key = entry.keys.toLowerCase()
      if (globalKeys.has(key)) throw new Error('Raccourci global dupliqué')
      globalKeys.add(key)
    }
  }
  return {
    schemaVersion: 2,
    theme: themes.has(next.theme) ? next.theme : base.theme,
    recordingBar: { visibility: next.recordingBar?.visibility === 'auto-fade' ? 'auto-fade' : 'always' },
    devices: next.devices && typeof next.devices === 'object' && !Array.isArray(next.devices) ? next.devices : {},
    shortcuts,
    backgroundPresets: presets(next.backgroundPresets),
    extras: next.extras && typeof next.extras === 'object' && !Array.isArray(next.extras) ? next.extras : {},
  }
}
function createPreferencesStore(file) {
  const targetFile = path.extname(file) ? file : path.join(file, 'preferencesSettings.json')
  const read = () => {
    try {
      return normalize(JSON.parse(fs.readFileSync(targetFile, 'utf8')))
    } catch {
      return defaults()
    }
  }
  const write = (value) => {
    const next = normalize(value)
    fs.mkdirSync(path.dirname(targetFile), { recursive: true })
    const temp = `${targetFile}.tmp`
    fs.writeFileSync(temp, `${JSON.stringify(next, null, 2)}\n`)
    fs.renameSync(temp, targetFile)
    return next
  }
  const patch = (value) => {
    const current = read()
    return write({
      ...current,
      ...(value || {}),
      recordingBar: { ...current.recordingBar, ...(value?.recordingBar || {}) },
      devices: { ...current.devices, ...(value?.devices || {}) },
      shortcuts: { ...current.shortcuts, ...(value?.shortcuts || {}) },
      backgroundPresets: { ...current.backgroundPresets, ...(value?.backgroundPresets || {}) },
      extras: { ...current.extras, ...(value?.extras || {}) },
    })
  }
  return { read, write, patch, file: targetFile }
}
module.exports = { createPreferencesStore, defaults, normalize }
