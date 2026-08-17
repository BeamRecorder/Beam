const { randomUUID } = require('crypto');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { normalizeCaption } = require('./composition-captions.cjs');
const {
  assignMigratedTrackIds,
  repairMigratedTrackIds,
  normalizeTrackOrders,
  validateTrackLayout,
} = require('./composition-tracks.cjs');

const schemaVersion = 7;
const transitionSchemaVersion = 6;
const typographySchemaVersion = 5;
const visualTrackSchemaVersion = 4;
const previousSchemaVersion = 3;
const captionTypeSchemaVersion = 2;
const legacySchemaVersion = 1;
const mediaKinds = new Set(['video', 'image', 'audio']);
const clipKinds = new Set(['screen', 'video', 'image', 'webcam', 'blur', 'audio', 'caption']);
const extensions = {
  video: new Set(['.mp4', '.webm', '.mov', '.mkv']),
  image: new Set(['.png', '.jpg', '.jpeg', '.webp']),
  audio: new Set(['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.webm']),
};
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const text = (value, max = 160) => (typeof value === 'string' ? value.slice(0, max) : '');
const id = (value) => typeof value === 'string' && value.length > 0 && value.length <= 600;
const color = (value, fallback) =>
  typeof value === 'string' && /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(value) ? value : fallback;
const emptyComposition = () => ({ schemaVersion, assets: [], clips: [], keyboardCaptionSessions: [] });
const transitionKinds = new Set(['fade', 'slide', 'zoom', 'blur']);
const transition = (value, clipKind) => {
  if (value === null) return null;
  if (!value || typeof value !== 'object' || !Number.isInteger(value.durationMs) || value.durationMs <= 0 || value.durationMs > 5000)
    throw new Error('Transition de clip invalide');
  const preset = value.preset;
  if (!preset || !transitionKinds.has(preset.kind) || (clipKind === 'audio' && preset.kind !== 'fade'))
    throw new Error('Preset de transition invalide');
  if (preset.kind === 'slide' && !['left', 'right', 'up', 'down'].includes(preset.direction))
    throw new Error('Direction de transition invalide');
  if (preset.kind === 'zoom' && !['in', 'out'].includes(preset.direction))
    throw new Error('Direction de transition invalide');
  if ((preset.kind === 'fade' || preset.kind === 'blur') && Object.keys(preset).some((key) => key !== 'kind'))
    throw new Error('Paramètres de transition invalides');
  return { preset: { ...preset }, durationMs: value.durationMs };
};
const transitions = (value, clipKind, durationMs) => {
  if (!value || typeof value !== 'object' || !Object.hasOwn(value, 'entry') || !Object.hasOwn(value, 'exit'))
    throw new Error('Transitions de clip invalides');
  const next = { entry: transition(value.entry, clipKind), exit: transition(value.exit, clipKind) };
  if ((next.entry?.durationMs || 0) + (next.exit?.durationMs || 0) > durationMs)
    throw new Error('Durée de transitions invalide');
  return next;
};
const withHistoricalTypography = (clip) =>
  clip.kind === 'caption'
    ? {
        ...clip,
        caption: {
          ...clip.caption,
          style: {
            ...clip.caption.style,
            fontFamily: 'sans-serif',
            fontWeight: 800,
            fontStyle: 'normal',
            textDecoration: 'none',
            textAlign: 'center',
            lineHeight: 1.2,
            letterSpacing: 0,
          },
        },
      }
    : clip;

const historicalAppearance = (kind, showBackground) => ({
  cornerRadius: kind === 'screen' ? (showBackground ? 'md' : 'none') : 'sm',
  shadowSize: 'md',
  shadowBlur: kind === 'screen' ? 40 : 20,
  shadowMode: 'solid',
  shadowColor: '#000000',
  shadowDirection: kind === 'screen' ? 'bottom' : 'all',
  borderEnabled: false,
  borderColor: '#000000',
  borderWidth: 1,
  frame: 'none',
  frameTitle: '',
  frameColor: '#c0c0c0',
  frameShowMenu: true,
  frameShowScrollbars: true,
  frameChromeScale: 1,
});

const rectangle = (value, label) => {
  const next = value || {};
  if (![next.x, next.y, next.width, next.height].every(finite) || next.width <= 0 || next.height <= 0)
    throw new Error(`${label} invalide`);
  return { x: next.x, y: next.y, width: next.width, height: next.height };
};

const appearance = (value) => {
  if (!value || typeof value !== 'object') throw new Error('Apparence de clip invalide');
  const radius = finite(value.cornerRadius)
    ? Math.max(0, Math.min(9999, value.cornerRadius))
    : ['none', 'sm', 'md', 'lg', 'full'].includes(value.cornerRadius)
      ? value.cornerRadius
      : null;
  if (
    radius === null ||
    !['none', 'sm', 'md', 'lg', 'custom'].includes(value.shadowSize) ||
    !finite(value.shadowBlur) ||
    !['solid', 'adaptive'].includes(value.shadowMode) ||
    color(value.shadowColor, null) === null ||
    !['all', 'bottom', 'bottom-right', 'top-left'].includes(value.shadowDirection) ||
    typeof value.borderEnabled !== 'boolean' ||
    color(value.borderColor, null) === null ||
    !finite(value.borderWidth) ||
    !['none', 'safari', 'windows-95'].includes(value.frame) ||
    color(value.frameColor, null) === null ||
    typeof value.frameShowMenu !== 'boolean' ||
    typeof value.frameShowScrollbars !== 'boolean' ||
    !finite(value.frameChromeScale)
  )
    throw new Error('Apparence de clip invalide');
  return {
    cornerRadius: radius,
    shadowSize: value.shadowSize,
    shadowBlur: Math.max(0, Math.min(96, value.shadowBlur)),
    shadowMode: value.shadowMode,
    shadowColor: color(value.shadowColor, null),
    shadowDirection: value.shadowDirection,
    borderEnabled: value.borderEnabled,
    borderColor: color(value.borderColor, null),
    borderWidth: Math.max(0, Math.min(32, value.borderWidth)),
    frame: value.frame,
    frameTitle: text(value.frameTitle, 120),
    frameColor: color(value.frameColor, null),
    frameShowMenu: value.frameShowMenu,
    frameShowScrollbars: value.frameShowScrollbars,
    frameChromeScale: Math.max(0.5, Math.min(2, value.frameChromeScale)),
  };
};

function normalizeComposition(value) {
  if (!value) throw new Error('Composition absente');
  if (
    value.schemaVersion !== schemaVersion ||
    !Array.isArray(value.assets) ||
    !Array.isArray(value.clips) ||
    !Array.isArray(value.keyboardCaptionSessions)
  )
    throw new Error(`Version de composition inconnue: ${String(value.schemaVersion)}`);
  const assetIds = new Set();
  const assets = value.assets.map((asset) => {
    if (!asset || !id(asset.id) || assetIds.has(asset.id) || !mediaKinds.has(asset.kind) || !finite(asset.durationMs))
      throw new Error('Média de composition invalide');
    assetIds.add(asset.id);
    const origin = asset.origin === 'session' ? 'session' : 'project';
    if (
      origin === 'project' &&
      (typeof asset.fileName !== 'string' || path.basename(asset.fileName) !== asset.fileName)
    )
      throw new Error('Fichier média invalide');
    if (
      origin === 'session' &&
      (!id(asset.sessionId) ||
        typeof asset.sessionPath !== 'string' ||
        !asset.sessionPath ||
        path.isAbsolute(asset.sessionPath) ||
        asset.sessionPath.split(/[\\/]+/).includes('..'))
    )
      throw new Error('Média de session invalide');
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
    };
  });
  const clipIds = new Set();
  const groups = new Map();
  const clips = value.clips.map((clip) => {
    if (!clip || !id(clip.id) || clipIds.has(clip.id) || !clipKinds.has(clip.kind) || typeof clip.enabled !== 'boolean')
      throw new Error('Clip invalide');
    clipIds.add(clip.id);
    const numbers = [
      clip.timelineStartMs,
      clip.timelineDurationMs,
      clip.sourceInMs,
      clip.sourceDurationMs,
      clip.playbackRate,
      clip.order,
    ];
    if (
      !numbers.every(finite) ||
      clip.timelineStartMs < 0 ||
      clip.timelineDurationMs < 40 ||
      clip.sourceInMs < 0 ||
      clip.sourceDurationMs <= 0 ||
      clip.playbackRate < 0.25 ||
      clip.playbackRate > 4 ||
      Math.abs(clip.timelineDurationMs - clip.sourceDurationMs / clip.playbackRate) > 2
    )
      throw new Error('Timing de clip invalide');
    const common = {
      id: clip.id,
      kind: clip.kind,
      name: text(clip.name) || 'Clip',
      timelineStartMs: Math.round(clip.timelineStartMs),
      timelineDurationMs: Math.round(clip.timelineDurationMs),
      sourceInMs: Math.round(clip.sourceInMs),
      sourceDurationMs: Math.round(clip.sourceDurationMs),
      playbackRate: clip.playbackRate,
      transitions: transitions(clip.transitions, clip.kind, Math.round(clip.timelineDurationMs)),
      enabled: clip.enabled,
      order: clip.order,
      ...(id(clip.groupId) ? { groupId: clip.groupId } : {}),
    };
    if (common.groupId) {
      const key = `${common.timelineStartMs}:${common.timelineDurationMs}:${common.playbackRate}`;
      if (groups.has(common.groupId) && groups.get(common.groupId) !== key) throw new Error('Groupe de clips invalide');
      groups.set(common.groupId, key);
    }
    if (clip.kind === 'caption')
      return {
        ...common,
        caption: normalizeCaption(clip.caption),
        ...(clip.transform ? { transform: rectangle(clip.transform, 'Transformation') } : {}),
        ...(typeof clip.isAiGenerated === 'boolean' ? { isAiGenerated: clip.isAiGenerated } : {}),
      };
    if (clip.kind === 'blur') {
      if (!id(clip.trackId)) throw new Error('Identifiant de piste visuelle invalide');
      const effectColor = color(clip.color, null);
      if (
        !['rectangle', 'square', 'circle'].includes(clip.shape) ||
        !['blur', 'frosted', 'pixelated', 'opaque'].includes(clip.mode) ||
        !finite(clip.strength) ||
        clip.strength < 0 ||
        clip.strength > 100 ||
        (clip.feather !== undefined && (!finite(clip.feather) || clip.feather < 0 || clip.feather > 100)) ||
        (clip.cornerRadius !== undefined &&
          (!finite(clip.cornerRadius) || clip.cornerRadius < 0 || clip.cornerRadius > 100)) ||
        (clip.tintOpacity !== undefined &&
          (!finite(clip.tintOpacity) || clip.tintOpacity < 0 || clip.tintOpacity > 100)) ||
        effectColor === null
      )
        throw new Error('Effet de flou invalide');
      return {
        ...common,
        trackId: clip.trackId,
        assetId: '',
        transform: rectangle(clip.transform, 'Transformation'),
        shape: clip.shape,
        mode: clip.mode,
        strength: Math.max(0, Math.min(100, clip.strength)),
        feather: clip.feather === undefined ? 0 : Math.max(0, Math.min(100, clip.feather)),
        cornerRadius: clip.cornerRadius === undefined ? 0 : Math.max(0, Math.min(100, clip.cornerRadius)),
        tintOpacity: clip.tintOpacity === undefined ? 0 : Math.max(0, Math.min(100, clip.tintOpacity)),
        color: effectColor,
      };
    }
    if (!id(clip.assetId) || !assetIds.has(clip.assetId)) throw new Error('Média du clip introuvable');
    if (clip.kind === 'audio')
      return {
        ...common,
        assetId: clip.assetId,
        role: ['system', 'microphone', 'imported'].includes(clip.role) ? clip.role : 'imported',
        volume: finite(clip.volume) ? Math.max(0, Math.min(200, clip.volume)) : 100,
      };
    if (!id(clip.trackId)) throw new Error('Identifiant de piste visuelle invalide');
    return {
      ...common,
      trackId: clip.trackId,
      assetId: clip.assetId,
      transform: rectangle(clip.transform, 'Transformation'),
      ...(clip.crop ? { crop: rectangle(clip.crop, 'Recadrage') } : {}),
      appearance: appearance(clip.appearance),
      ...(typeof clip.isMirrored === 'boolean' && typeof clip.isMirroredY === 'boolean'
        ? { isMirrored: clip.isMirrored, isMirroredY: clip.isMirroredY }
        : (() => {
            throw new Error('Miroir de clip invalide');
          })()),
    };
  });
  const groupCounts = new Map();
  for (const clip of clips) if (clip.groupId) groupCounts.set(clip.groupId, (groupCounts.get(clip.groupId) || 0) + 1);
  const normalizedClips = normalizeTrackOrders(
    clips.map((clip) => (clip.groupId && groupCounts.get(clip.groupId) < 2 ? { ...clip, groupId: undefined } : clip)),
  );
  validateTrackLayout(normalizedClips);
  return {
    schemaVersion,
    assets,
    keyboardCaptionSessions: [
      ...new Set(
        value.keyboardCaptionSessions.map((sessionId) => {
          if (!id(sessionId)) throw new Error('Session de captions clavier invalide');
          return sessionId;
        }),
      ),
    ],
    clips: normalizedClips,
  };
}

function migrateComposition(value, showBackground, historicalSessionIds = []) {
  if (
    !value ||
    ![
      legacySchemaVersion,
      captionTypeSchemaVersion,
      previousSchemaVersion,
      visualTrackSchemaVersion,
      typographySchemaVersion,
      transitionSchemaVersion,
    ].includes(value.schemaVersion) ||
    !Array.isArray(value.assets) ||
    !Array.isArray(value.clips)
  )
    throw new Error(`Version de composition inconnue: ${String(value?.schemaVersion)}`);
  if ([visualTrackSchemaVersion, typographySchemaVersion, transitionSchemaVersion].includes(value.schemaVersion)) {
    return normalizeComposition({
      ...value,
      schemaVersion,
      keyboardCaptionSessions: Array.isArray(value.keyboardCaptionSessions)
        ? value.keyboardCaptionSessions
        : historicalSessionIds,
      clips: repairMigratedTrackIds(value.clips).map(withHistoricalTypography).map((clip) => ({
        ...clip,
        transitions: { entry: null, exit: null },
      })),
    });
  }
  return normalizeComposition({
    schemaVersion,
    assets: value.assets,
    keyboardCaptionSessions: historicalSessionIds,
    clips: repairMigratedTrackIds(
      assignMigratedTrackIds(
        value.clips.map((sourceClip) => {
          const clip = { ...sourceClip, transitions: { entry: null, exit: null } };
          if (clip.kind === 'caption') {
            if (value.schemaVersion === captionTypeSchemaVersion)
              return withHistoricalTypography({ ...clip, caption: { ...clip.caption, type: 'text' } });
            if (value.schemaVersion === previousSchemaVersion) return withHistoricalTypography(clip);
            const style = clip.caption?.style || {};
            return {
              ...clip,
              caption: {
                ...clip.caption,
                type: 'text',
                style: {
                  fontFamily: 'sans-serif',
                  fontWeight: 800,
                  fontStyle: 'normal',
                  textDecoration: 'none',
                  textAlign: 'center',
                  lineHeight: 1.2,
                  letterSpacing: 0,
                  color: typeof style.color === 'string' ? style.color : '#ffffff',
                  fontSize: finite(style.fontSize) ? style.fontSize : 42,
                  wrap: typeof style.wrap === 'boolean' ? style.wrap : true,
                  shadowColor: typeof style.shadowColor === 'string' ? style.shadowColor : '#000000',
                  shadowBlur: finite(style.shadowBlur) ? style.shadowBlur : 4,
                  backdropBlur: finite(style.backdropBlur) ? style.backdropBlur : 0,
                  outlineColor: typeof style.boxColor === 'string' ? style.boxColor : '#000000',
                  outlineWidth: finite(style.boxPadding) ? style.boxPadding : 6,
                  extrusionDepth: finite(style.boxRadius) ? style.boxRadius : 4,
                  placement: ['top', 'center', 'bottom'].includes(style.placement) ? style.placement : 'bottom',
                  ...(typeof style.shadowDirection === 'string' ? { shadowDirection: style.shadowDirection } : {}),
                  ...(finite(style.shadowOffsetX) ? { shadowOffsetX: style.shadowOffsetX } : {}),
                  ...(finite(style.shadowOffsetY) ? { shadowOffsetY: style.shadowOffsetY } : {}),
                  ...(typeof style.customText === 'string' ? { customText: style.customText } : {}),
                },
              },
            };
          }
          if (!['screen', 'video', 'image', 'webcam'].includes(clip.kind)) return clip;
          return {
            ...clip,
            appearance: { ...historicalAppearance(clip.kind, showBackground), ...(clip.appearance || {}) },
            isMirrored: typeof clip.isMirrored === 'boolean' ? clip.isMirrored : false,
            isMirroredY: typeof clip.isMirroredY === 'boolean' ? clip.isMirroredY : false,
          };
        }),
      ),
    ),
  });
}

const materializeComposition = (directory, composition, sessionFileFor, mediaUrlFor) => ({
  ...composition,
  assets: composition.assets.map((asset) => {
    const target =
      asset.origin === 'session'
        ? sessionFileFor(directory, asset.sessionId, asset.sessionPath)
        : path.join(directory, 'media', asset.fileName);
    const fileUrl = target && fs.existsSync(target) ? pathToFileURL(target).href : null;
    return { ...asset, src: fileUrl ? mediaUrlFor(fileUrl) || '' : '' };
  }),
});

const importMedia = (directory, input) => {
  if (!input || typeof input.source !== 'string' || !mediaKinds.has(input.kind))
    throw new Error('Import de média invalide');
  const extension = path.extname(input.source).toLowerCase();
  if (extension === '.gif') throw new Error('GIF not supported');
  if (!extensions[input.kind].has(extension)) throw new Error('Type de média non autorisé');
  const targetDirectory = path.join(directory, 'media');
  fs.mkdirSync(targetDirectory, { recursive: true });
  const fileName = `${randomUUID()}${extension}`;
  fs.copyFileSync(input.source, path.join(targetDirectory, fileName));
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
  };
};

const pruneProjectMedia = (directory, previous, next) => {
  const used = new Set(next.assets.filter((asset) => asset.origin === 'project').map((asset) => asset.fileName));
  for (const asset of previous.assets || []) {
    if (asset.origin !== 'project' || used.has(asset.fileName)) continue;
    fs.rmSync(path.join(directory, 'media', asset.fileName), { force: true });
  }
};

module.exports = {
  emptyComposition,
  normalizeComposition,
  migrateComposition,
  materializeComposition,
  importMedia,
  pruneProjectMedia,
};
