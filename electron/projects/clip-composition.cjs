const path = require('path');
const { normalizeCaption } = require('./composition-captions.cjs');
const { normalizeColorFill } = require('./composition-color-fill.cjs');
const { normalizeColorLayerStyle } = require('./composition-color-layer.cjs');
const { normalizeShapeLayerStyle } = require('./composition-shape-layer.cjs');
const { normalizePhoneFrameFill } = require('./composition-phone-frame-fill.cjs');
const { historicalAppearance } = require('./composition-appearance.cjs');
const { withoutInheritedKeyboardText, withHistoricalTypography } = require('./composition-migration-helpers.cjs');
const { normalizeClipTransitions } = require('./composition-clip-transitions.cjs');
const { materializeComposition, importMedia, pruneProjectMedia } = require('./composition-project-media.cjs');
const {
  assignMigratedTrackIds,
  repairMigratedTrackIds,
  normalizeTrackOrders,
  validateTrackLayout,
} = require('./composition-tracks.cjs');
const schemaVersion = 14;
const audioNormalizationSchemaVersion = 13;
const previousCompositionSchemaVersion = 12;
const colorLayerSchemaVersion = 11;
const captionPreferenceRepairSchemaVersion = 10;
const keyboardCaptionRetrySchemaVersion = 9;
const captionHighlightSchemaVersion = 8;
const cameraLayoutSchemaVersion = 7;
const transitionSchemaVersion = 6;
const typographySchemaVersion = 5;
const visualTrackSchemaVersion = 4;
const previousSchemaVersion = 3;
const captionTypeSchemaVersion = 2;
const legacySchemaVersion = 1;
const mediaKinds = new Set(['video', 'image', 'audio']);
const clipKinds = new Set(['screen', 'video', 'image', 'webcam', 'color', 'shape', 'blur', 'audio', 'caption']);
const cameraLayoutPresets = new Set([
  'custom',
  'floating-top-left',
  'floating-top-right',
  'floating-bottom-left',
  'floating-bottom-right',
  'floating-center',
  'fullscreen',
  'split-left',
  'split-right',
  'split-top',
  'split-bottom',
]);
const cameraFramingPresets = new Set([
  'custom',
  'fill',
  'fit',
  'square',
  'portrait',
  'landscape',
  'squircle',
  'circle',
]);
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const text = (value, max = 160) => (typeof value === 'string' ? value.slice(0, max) : '');
const id = (value) => typeof value === 'string' && value.length > 0 && value.length <= 600;
const color = (value, fallback) =>
  typeof value === 'string' && /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(value) ? value : fallback;
const normalizeAudioAnalysis = (value) => {
  if (
    !value ||
    !Number.isSafeInteger(value.version) ||
    value.version <= 0 ||
    !id(value.key) ||
    ![value.rangeStartMs, value.rangeDurationMs, value.sampleRate, value.channels].every(finite) ||
    value.rangeStartMs < 0 ||
    value.rangeDurationMs <= 0 ||
    value.sampleRate <= 0 ||
    value.channels <= 0
  )
    throw new Error('Analyse audio invalide');
  const optionalLevel = (level) => (finite(level) ? Math.max(-240, Math.min(24, level)) : null);
  return {
    version: value.version,
    key: value.key,
    rangeStartMs: Math.round(value.rangeStartMs),
    rangeDurationMs: Math.round(value.rangeDurationMs),
    sampleRate: Math.round(value.sampleRate),
    channels: Math.round(value.channels),
    integratedLufs: optionalLevel(value.integratedLufs),
    samplePeakDbfs: optionalLevel(value.samplePeakDbfs),
    truePeakDbtp: optionalLevel(value.truePeakDbtp),
  };
};
const normalizeAudioNormalization = (value) => {
  if (value === undefined) return undefined;
  if (
    !value ||
    typeof value.enabled !== 'boolean' ||
    !['lufs', 'peak'].includes(value.mode) ||
    ![value.targetLufs, value.targetPeakDbtp, value.appliedGainDb].every(finite) ||
    !Number.isSafeInteger(value.analysisVersion) ||
    value.analysisVersion <= 0 ||
    !id(value.analysisKey)
  )
    throw new Error('Normalisation audio invalide');
  return {
    enabled: value.enabled,
    mode: value.mode,
    targetLufs: Math.max(-60, Math.min(0, value.targetLufs)),
    targetPeakDbtp: Math.max(-24, Math.min(0, value.targetPeakDbtp)),
    appliedGainDb: Math.max(-24, Math.min(24, value.appliedGainDb)),
    analysisVersion: value.analysisVersion,
    analysisKey: value.analysisKey,
  };
};
const emptyComposition = () => ({
  schemaVersion,
  assets: [],
  clips: [],
  keyboardCaptionSessions: [],
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
    !['none', 'safari', 'windows-95', 'iphone-16-max', 'pixel-9-pro'].includes(value.frame) ||
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
    phoneFrameFill: normalizePhoneFrameFill(value.phoneFrameFill),
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
      ...(Array.isArray(asset.audioAnalyses)
        ? { audioAnalyses: asset.audioAnalyses.slice(-64).map(normalizeAudioAnalysis) }
        : {}),
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
      transitions: normalizeClipTransitions(clip.transitions, clip.kind, Math.round(clip.timelineDurationMs)),
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
        ...(id(clip.captionLayerId) ? { captionLayerId: clip.captionLayerId } : {}),
        ...(clip.transform ? { transform: rectangle(clip.transform, 'Transformation') } : {}),
        ...(typeof clip.isAiGenerated === 'boolean' ? { isAiGenerated: clip.isAiGenerated } : {}),
      };
    if (clip.kind === 'color') {
      if (!id(clip.trackId)) throw new Error('Identifiant de piste visuelle invalide');
      return {
        ...common,
        trackId: clip.trackId,
        assetId: '',
        transform: rectangle(clip.transform, 'Transformation'),
        fill: normalizeColorFill(clip.fill),
        ...normalizeColorLayerStyle(clip),
      };
    }
    if (clip.kind === 'shape') {
      if (!id(clip.trackId)) throw new Error('Identifiant de piste visuelle invalide');
      return {
        ...common,
        trackId: clip.trackId,
        assetId: '',
        transform: rectangle(clip.transform, 'Transformation'),
        ...normalizeShapeLayerStyle(clip),
      };
    }
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
        role: ['system', 'microphone', 'voiceover', 'imported'].includes(clip.role) ? clip.role : 'imported',
        volume: finite(clip.volume) ? Math.max(0, Math.min(200, clip.volume)) : 100,
        ...(clip.normalization === undefined ? {} : { normalization: normalizeAudioNormalization(clip.normalization) }),
      };
    if (!id(clip.trackId)) throw new Error('Identifiant de piste visuelle invalide');
    if (
      clip.freezeFrameSourceMs !== undefined &&
      (clip.kind === 'image' ||
        !finite(clip.freezeFrameSourceMs) ||
        Math.round(clip.freezeFrameSourceMs) !== common.sourceInMs ||
        assets.find((asset) => asset.id === clip.assetId)?.kind !== 'video')
    )
      throw new Error('Image figée invalide');
    const cameraPresets = ['screen', 'video', 'image', 'webcam'].includes(clip.kind)
      ? (() => {
          const cameraLayoutPreset = clip.cameraLayoutPreset === undefined ? 'custom' : clip.cameraLayoutPreset;
          const cameraFramingPreset = clip.cameraFramingPreset === undefined ? 'custom' : clip.cameraFramingPreset;
          const cameraSplitRatio = clip.cameraSplitRatio === undefined ? 0.5 : clip.cameraSplitRatio;
          const cameraSplitPadding = clip.cameraSplitPadding === undefined ? 0 : clip.cameraSplitPadding;
          if (!cameraLayoutPresets.has(cameraLayoutPreset) || !cameraFramingPresets.has(cameraFramingPreset))
            throw new Error('Preset de caméra invalide');
          if (clip.kind !== 'webcam' && cameraLayoutPreset.startsWith('split-'))
            throw new Error('Preset split réservé à une caméra');
          if (clip.kind !== 'webcam') return { cameraLayoutPreset, cameraFramingPreset };
          if (!finite(cameraSplitRatio) || cameraSplitRatio < 0.2 || cameraSplitRatio > 0.8)
            throw new Error('Répartition de caméra invalide');
          if (!finite(cameraSplitPadding) || cameraSplitPadding < 0 || cameraSplitPadding > 0.08)
            throw new Error('Espacement de caméra invalide');
          const reactToZoom =
            clip.reactToZoom === undefined ? !cameraLayoutPreset.startsWith('split-') : clip.reactToZoom;
          if (typeof reactToZoom !== 'boolean') throw new Error('Réaction de caméra au zoom invalide');
          return {
            cameraLayoutPreset,
            cameraFramingPreset,
            cameraSplitRatio,
            cameraSplitPadding,
            reactToZoom,
          };
        })()
      : {};
    return {
      ...common,
      trackId: clip.trackId,
      assetId: clip.assetId,
      transform: rectangle(clip.transform, 'Transformation'),
      ...(clip.crop ? { crop: rectangle(clip.crop, 'Recadrage') } : {}),
      appearance: appearance(clip.appearance),
      ...(clip.freezeFrameSourceMs !== undefined ? { freezeFrameSourceMs: Math.round(clip.freezeFrameSourceMs) } : {}),
      ...cameraPresets,
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
  if (value?.schemaVersion === schemaVersion) return normalizeComposition(value);
  if (
    !value ||
    ![
      legacySchemaVersion,
      captionTypeSchemaVersion,
      previousSchemaVersion,
      visualTrackSchemaVersion,
      typographySchemaVersion,
      transitionSchemaVersion,
      cameraLayoutSchemaVersion,
      captionHighlightSchemaVersion,
      keyboardCaptionRetrySchemaVersion,
      captionPreferenceRepairSchemaVersion,
      colorLayerSchemaVersion,
      audioNormalizationSchemaVersion,
      previousCompositionSchemaVersion,
    ].includes(value.schemaVersion) ||
    !Array.isArray(value.assets) ||
    !Array.isArray(value.clips)
  )
    throw new Error(`Version de composition inconnue: ${String(value?.schemaVersion)}`);
  if (
    [
      visualTrackSchemaVersion,
      typographySchemaVersion,
      transitionSchemaVersion,
      cameraLayoutSchemaVersion,
      captionHighlightSchemaVersion,
      keyboardCaptionRetrySchemaVersion,
      captionPreferenceRepairSchemaVersion,
      colorLayerSchemaVersion,
      audioNormalizationSchemaVersion,
      previousCompositionSchemaVersion,
    ].includes(value.schemaVersion)
  ) {
    const keyboardCaptionSessions = Array.isArray(value.keyboardCaptionSessions)
      ? value.keyboardCaptionSessions
      : historicalSessionIds;
    const repairedKeyboardCaptionSessions =
      value.schemaVersion === keyboardCaptionRetrySchemaVersion
        ? keyboardCaptionSessions.filter((sessionId) =>
            value.clips.some(
              (clip) =>
                clip?.kind === 'caption' &&
                clip.caption?.type === 'keyboard' &&
                clip.caption.sourceSessionId === sessionId,
            ),
          )
        : keyboardCaptionSessions;
    return normalizeComposition({
      ...value,
      schemaVersion,
      keyboardCaptionSessions: repairedKeyboardCaptionSessions,
      clips: [
        captionHighlightSchemaVersion,
        keyboardCaptionRetrySchemaVersion,
        captionPreferenceRepairSchemaVersion,
        colorLayerSchemaVersion,
        audioNormalizationSchemaVersion,
        previousCompositionSchemaVersion,
      ].includes(value.schemaVersion)
        ? repairMigratedTrackIds(value.clips).map((clip) =>
            [keyboardCaptionRetrySchemaVersion, captionPreferenceRepairSchemaVersion].includes(value.schemaVersion)
              ? withoutInheritedKeyboardText(clip)
              : clip,
          )
        : (value.schemaVersion === cameraLayoutSchemaVersion
            ? repairMigratedTrackIds(value.clips)
            : repairMigratedTrackIds(value.clips).map(withHistoricalTypography)
          ).map((clip) => ({
            ...clip,
            ...(value.schemaVersion < cameraLayoutSchemaVersion ? { transitions: { entry: null, exit: null } } : {}),
            ...(['screen', 'video', 'image', 'webcam'].includes(clip.kind)
              ? {
                  cameraLayoutPreset: 'custom',
                  cameraFramingPreset: 'custom',
                  ...(clip.kind === 'webcam'
                    ? {
                        cameraSplitRatio: 0.5,
                        cameraSplitPadding: 0,
                        reactToZoom: true,
                      }
                    : {}),
                }
              : {}),
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
          const clip = {
            ...sourceClip,
            transitions: { entry: null, exit: null },
          };
          if (clip.kind === 'caption') {
            if (value.schemaVersion === captionTypeSchemaVersion)
              return withHistoricalTypography({
                ...clip,
                caption: { ...clip.caption, type: 'text' },
              });
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
            appearance: {
              ...historicalAppearance(clip.kind, showBackground),
              ...clip.appearance,
            },
            isMirrored: typeof clip.isMirrored === 'boolean' ? clip.isMirrored : false,
            isMirroredY: typeof clip.isMirroredY === 'boolean' ? clip.isMirroredY : false,
          };
        }),
      ),
    ),
  });
}
module.exports = {
  compositionSchemaVersion: schemaVersion,
  emptyComposition,
  normalizeComposition,
  migrateComposition,
  materializeComposition,
  importMedia,
  pruneProjectMedia,
};
