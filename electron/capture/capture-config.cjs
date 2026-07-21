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
  }
}

module.exports = { buildDefaultCaptureConfig, selectSource }
