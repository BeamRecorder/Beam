const { randomUUID } = require('crypto')

function selectSource(sources, kind, requestedId) {
  if (requestedId) {
    const selected = sources.find((source) => source.id === requestedId && source.kind === kind)
    if (!selected) throw new Error(`Source ${kind} introuvable: ${requestedId}`)
    return selected
  }
  return sources.find((source) => source.kind === kind && source.isDefault) || sources.find((source) => source.kind === kind) || null
}

function positiveInteger(value, fallback, name) {
  const selected = value ?? fallback
  if (!Number.isSafeInteger(selected) || selected <= 0) throw new Error(`${name} doit être un entier strictement positif`)
  return selected
}

function screenRegion(value, screenKind) {
  if (value == null) return null
  if (screenKind !== 'display' || typeof value !== 'object') throw new Error('La sélection de zone est disponible uniquement pour un écran')
  const values = ['x', 'y', 'width', 'height'].map((key) => value[key])
  if (!values.every((entry) => Number.isFinite(entry)) || value.x < 0 || value.y < 0 || value.width <= 0 || value.height <= 0 || value.x + value.width > 1 || value.y + value.height > 1) {
    throw new Error('La zone de capture est invalide')
  }
  return { x: value.x, y: value.y, width: value.width, height: value.height }
}

function buildDefaultCaptureConfig(catalog, options, environment) {
  const sources = Array.isArray(catalog?.sources) ? catalog.sources : []
  const capabilities = catalog?.capabilities || {}
  const screenKind = options.screenKind === 'window' ? 'window' : 'display'
  const screen = selectSource(sources, screenKind, options.screenId)
  if (!screen) throw new Error('Aucun écran ou fenêtre capturable n’est disponible')
  return {
    projectId: options.projectId || randomUUID(), screen: { mode: 'source', sourceId: screen.id },
    cursor: options.cursor !== false && capabilities.separateCursor ? { mode: 'separate', captureClicks: Boolean(capabilities.cursorClicks), captureShape: Boolean(capabilities.cursorShapes) } : { mode: capabilities.embeddedCursor ? 'embedded' : 'disabled' },
    recording: { outputRoot: options.outputRoot || environment.defaultOutputRoot, videoBitrateBps: positiveInteger(options.videoBitrateBps, 12_000_000, 'videoBitrateBps'), targetFps: positiveInteger(options.targetFps, 60, 'targetFps'), keyframeIntervalSeconds: 2, queueCapacity: positiveInteger(options.queueCapacity, 8, 'queueCapacity'), minimumFreeBytes: options.minimumFreeBytes ?? 536_870_912 },
    failurePolicy: options.failurePolicy || 'continue-without-optional-tracks',
    region: screenRegion(options.region, screenKind),
    excludedProcessId: environment.excludedProcessId,
  }
}

module.exports = { buildDefaultCaptureConfig, selectSource, screenRegion }
