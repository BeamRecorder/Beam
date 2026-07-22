const fs = require('fs')
const path = require('path')

const defaults = () => ({ schemaVersion: 1, theme: 'light', recordingBar: { visibility: 'always' }, devices: {}, shortcuts: { 'hud.startStopRecording': { keys: 'Alt+Shift+R', scope: 'global', category: 'hud' }, 'editor.playPause': { keys: 'Space', scope: 'application', category: 'video-editor' } }, extras: {} })
const themes = new Set(['light', 'dark', 'system'])
const scopes = new Set(['global', 'application'])
const shortcut = (value) => value && typeof value.keys === 'string' && value.keys.length > 0 && value.keys.length <= 80 && scopes.has(value.scope) && typeof value.category === 'string' && value.category.length > 0
const normalize = (value) => {
  const base = defaults(); const next = value && typeof value === 'object' ? value : {}
  const shortcuts = next.shortcuts && typeof next.shortcuts === 'object' ? Object.fromEntries(Object.entries(next.shortcuts).flatMap(([id, entry]) => typeof id === 'string' && shortcut(entry) ? [[id, { keys: entry.keys, scope: entry.scope, category: entry.category }]] : [])) : base.shortcuts
  const globalKeys = new Set(); for (const entry of Object.values(shortcuts)) { if (entry.scope === 'global') { const key = entry.keys.toLowerCase(); if (globalKeys.has(key)) throw new Error('Raccourci global dupliqué'); globalKeys.add(key) } }
  return { schemaVersion: 1, theme: themes.has(next.theme) ? next.theme : base.theme, recordingBar: { visibility: next.recordingBar?.visibility === 'auto-fade' ? 'auto-fade' : 'always' }, devices: next.devices && typeof next.devices === 'object' && !Array.isArray(next.devices) ? next.devices : {}, shortcuts, extras: next.extras && typeof next.extras === 'object' && !Array.isArray(next.extras) ? next.extras : {} }
}
function createPreferencesStore(directory) {
  const file = path.join(directory, 'preferencesSettings.json')
  const read = () => { try { return normalize(JSON.parse(fs.readFileSync(file, 'utf8'))) } catch { return defaults() } }
  const write = (value) => { const next = normalize(value); fs.mkdirSync(directory, { recursive: true }); const temp = `${file}.tmp`; fs.writeFileSync(temp, `${JSON.stringify(next, null, 2)}\n`); fs.renameSync(temp, file); return next }
  const patch = (value) => write({ ...read(), ...(value || {}), recordingBar: { ...read().recordingBar, ...(value?.recordingBar || {}) }, devices: { ...read().devices, ...(value?.devices || {}) }, shortcuts: { ...read().shortcuts, ...(value?.shortcuts || {}) }, extras: { ...read().extras, ...(value?.extras || {}) } })
  return { read, write, patch, file }
}
module.exports = { createPreferencesStore, defaults, normalize }
