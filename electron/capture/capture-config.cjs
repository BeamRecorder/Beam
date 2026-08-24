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
  if (screenKind !== 'display' || typeof value !== 'object')
    throw new Error('La sélection de zone est disponible uniquement pour un écran');
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
  // Portal sources are stable intents, not enumerated desktop objects. The HUD
  // may have selected one from an earlier catalog snapshot, while a later
  // capability probe can transiently return no virtual sources. Accept only
  // Beam's exact Linux Portal IDs here; Rust revalidates Portal, PipeWire and
  // FFmpeg before opening the system picker.
  const screen =
    stablePortalSource(options.screenId, screenKind, environment.platform) ||
    selectSource(sources, screenKind, options.screenId, environment.platform);
  if (!screen) throw new Error('Aucun écran ou fenêtre capturable n’est disponible');
  const portalSelection = screen.selectionMode === 'portal';
  const region = screenRegion(options.region, screenKind);
  return {
    projectId: options.projectId || randomUUID(),
    screen: portalSelection
      ? {
          mode: 'portal',
          kind: screenKind === 'window' ? 'window' : 'monitor',
          restoreToken: null,
        }
      : { mode: 'source', sourceId: screen.id },
    systemAudio: environment.platform === 'linux' && options.systemAudio === true ? { mode: 'default-output' } : null,
    cursor:
      options.cursor !== false && capabilities.separateCursor
        ? {
            mode: 'separate',
            captureClicks:
              Boolean(capabilities.cursorClicks) &&
              (environment.platform !== 'linux' || options.recordInteractions === true),
            captureShortcuts: options.recordInteractions === true && Boolean(capabilities.inputShortcuts),
            captureShape: Boolean(capabilities.cursorShapes),
          }
        : { mode: capabilities.embeddedCursor ? 'embedded' : 'disabled' },
    recording: {
      outputRoot: options.outputRoot || environment.defaultOutputRoot,
      videoBitrateBps: positiveInteger(options.videoBitrateBps, 12_000_000, 'videoBitrateBps'),
      targetFps: positiveInteger(options.targetFps, 60, 'targetFps'),
      keyframeIntervalSeconds: 2,
      queueCapacity: positiveInteger(options.queueCapacity, 8, 'queueCapacity'),
      minimumFreeBytes: options.minimumFreeBytes ?? 536_870_912,
    },
    failurePolicy: options.failurePolicy || 'continue-without-optional-tracks',
    region,
    excludedProcessId: environment.excludedProcessId,
  };
}

module.exports = { buildDefaultCaptureConfig, canonicalWindowSourceId, selectSource, screenRegion };
