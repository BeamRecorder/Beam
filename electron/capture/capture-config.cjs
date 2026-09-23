const { randomUUID } = require('crypto');

function parseHwnd(id) {
  if (!id) return null;
  const str = String(id)
    .replace(/^(wgc:window:|sck:window:|window:)/, '')
    .split(':')[0];
  if (!str) return null;
  const numDec = /^\d+$/.test(str) ? Number(str) : null;
  const numHex = /^[0-9a-f]+$/i.test(str) ? Number.parseInt(str, 16) : null;
  return { dec: isNaN(numDec) ? null : numDec, hex: isNaN(numHex) ? null : numHex };
}

function matchSourceId(source, requestedId) {
  if (source.id === requestedId) return true;
  const a = parseHwnd(source.id);
  const b = parseHwnd(requestedId);
  if (!a || !b) return false;
  return (
    (a.dec !== null && (a.dec === b.dec || a.dec === b.hex)) || (a.hex !== null && (a.hex === b.dec || a.hex === b.hex))
  );
}

function canonicalWindowSourceId(requestedId, platform) {
  const parsed = parseHwnd(requestedId);
  if (!parsed) return null;
  const numericId = parsed.dec ?? parsed.hex;
  if (!Number.isSafeInteger(numericId) || numericId <= 0) return null;
  return platform === 'darwin' ? `sck:window:${numericId}` : `wgc:window:${numericId.toString(16)}`;
}

function stablePortalSource(requestedId, kind, platform) {
  if (platform !== 'linux') return null;
  if (kind === 'display' && requestedId === 'portal:monitor') {
    return { id: requestedId, kind, selectionMode: 'portal' };
  }
  if (kind === 'window' && requestedId === 'portal:window') {
    return { id: requestedId, kind, selectionMode: 'portal' };
  }
  return null;
}

function selectSource(sources, kind, requestedId, platform) {
  const platformPrefix =
    kind === 'window' ? (platform === 'darwin' ? 'sck:window:' : platform === 'win32' ? 'wgc:window:' : null) : null;

  if (requestedId) {
    const selected =
      sources.find((source) => source.kind === kind && source.id === requestedId) ||
      sources.find(
        (source) =>
          source.kind === kind &&
          (!platformPrefix || source.id.startsWith(platformPrefix)) &&
          matchSourceId(source, requestedId),
      );
    if (selected) return selected;
    if (kind === 'window') {
      const formattedId = canonicalWindowSourceId(requestedId, platform);
      const canonical = sources.find((source) => source.kind === kind && source.id === formattedId);
      if (canonical) return canonical;
    }
    throw new Error(`Source ${kind} introuvable: ${requestedId}`);
  }
  return (
    sources.find((source) => source.kind === kind && source.isDefault) ||
    sources.find((source) => source.kind === kind) ||
    null
  );
}

function positiveInteger(value, fallback, name) {
  const selected = value ?? fallback;
  if (!Number.isSafeInteger(selected) || selected <= 0)
    throw new Error(`${name} doit être un entier strictement positif`);
  return selected;
}

function screenRegion(value, screenKind) {
  if (value == null) return null;
  if (typeof value !== 'object') throw new Error('La sélection de zone est disponible uniquement pour un écran');
  const values = ['x', 'y', 'width', 'height'].map((key) => value[key]);
  if (
    !values.every((entry) => Number.isFinite(entry)) ||
    value.x < 0 ||
    value.y < 0 ||
    value.width <= 0 ||
    value.height <= 0 ||
    value.x + value.width > 1 ||
    value.y + value.height > 1
  ) {
    throw new Error('La zone de capture est invalide');
  }
  return { x: value.x, y: value.y, width: value.width, height: value.height };
}

function buildDefaultCaptureConfig(catalog, options, environment) {
  const sources = Array.isArray(catalog?.sources) ? catalog.sources : [];
  const capabilities = catalog?.capabilities || {};
  const screenKind = options.screenKind === 'window' ? 'window' : 'display';
  const screen =
    stablePortalSource(options.screenId, screenKind, environment.platform) ||
    selectSource(sources, screenKind, options.screenId, environment.platform);
  if (!screen) throw new Error('Aucun écran ou fenêtre capturable n’est disponible');
  const audio = (id, enabled) =>
    !enabled ? { mode: 'disabled' } : !id || id === 'default' ? { mode: 'default' } : { mode: 'device', deviceId: id };
  const camera =
    !options.cameraId || options.cameraId === 'off'
      ? { mode: 'disabled' }
      : { mode: 'device', deviceId: options.cameraId, width: 1280, height: 720, fps: 30 };
  return {
    projectId: options.projectId || randomUUID(),
    output: environment.instantRoot && options.outputRoot === environment.instantRoot ? 'instant' : 'studio',
    screen: {
      selection:
        screen.selectionMode === 'portal'
          ? {
              mode: 'portal',
              kind: screenKind === 'window' ? 'window' : 'monitor',
              restoreToken: null,
            }
          : { mode: 'source', sourceId: screen.id },
      region: screenRegion(options.region, screenKind),
      fps: positiveInteger(options.targetFps, 60, 'targetFps'),
      cursor:
        options.cursor === false
          ? { mode: 'disabled' }
          : capabilities.separateCursor
            ? {
                mode: 'separate',
                captureClicks: options.recordInteractions === true && Boolean(capabilities.cursorClicks),
                captureShortcuts: options.recordInteractions === true && Boolean(capabilities.inputShortcuts),
                captureShape: Boolean(capabilities.cursorShapes),
              }
            : { mode: capabilities.embeddedCursor ? 'embedded' : 'disabled' },
      excludedWindowHandles: Array.isArray(options.excludedWindowHandles)
        ? options.excludedWindowHandles
            .filter((value) => typeof value === 'string' && /^[0-9a-f]+$/i.test(value))
            .slice(0, 16)
        : [],
    },
    camera,
    microphone: audio(options.microphoneId, Boolean(options.microphoneId && options.microphoneId !== 'no-audio')),
    systemAudio: audio(options.systemOutputId, options.systemAudio === true),
  };
}

module.exports = { buildDefaultCaptureConfig, canonicalWindowSourceId, selectSource, screenRegion };
