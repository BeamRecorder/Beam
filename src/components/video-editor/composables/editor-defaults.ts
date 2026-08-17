import type { ProjectEditorState } from '~/api/types/capture-api';
import {
  isAudioClip,
  isBlurClip,
  isCaptionClip,
  isVisualClip,
  type Clip,
  type VisualClip,
} from '~/media/shared/composition-types';
import { createDefaultCaptionStyle, createDefaultClipAppearance } from '~/media/shared/composition-defaults';
import { isCameraFramingPreset, isCameraLayoutPreset } from '~/media/shared/camera-layout-types';
import { normalizeClipTransitions } from '~/media/shared/clip-transitions';
import { normalizeOutputCanvas } from '../canvas/output-canvas';
import type { ZoomElement } from '../zoom/zoom-types';
import type { EditorPreferenceDefaults, VisualClipDefaults } from './editor-default-types';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
const finite = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const transform = (value: unknown, fallback: VisualClipDefaults['transform']) => {
  const input = record(value);
  const next = {
    x: finite(input.x, fallback.x),
    y: finite(input.y, fallback.y),
    width: finite(input.width, fallback.width),
    height: finite(input.height, fallback.height),
  };
  return next.width > 0 && next.height > 0 ? next : fallback;
};

const visualDefaults = (kind: VisualClip['kind'], value: unknown): VisualClipDefaults => {
  const input = record(value);
  const fallbackTransform =
    kind === 'webcam' ? { x: 0.72, y: 0.72, width: 0.24, height: 0.24 } : { x: 0, y: 0, width: 1, height: 1 };
  const layout = isCameraLayoutPreset(input.cameraLayoutPreset) ? input.cameraLayoutPreset : 'custom';
  return {
    transform: transform(input.transform, fallbackTransform),
    appearance: { ...createDefaultClipAppearance(kind), ...record(input.appearance) },
    isMirrored: input.isMirrored === true,
    isMirroredY: input.isMirroredY === true,
    playbackRate: Math.min(4, Math.max(0.25, finite(input.playbackRate, 1))),
    transitions:
      input.transitions && typeof input.transitions === 'object'
        ? clone(input.transitions as VisualClipDefaults['transitions'])
        : { entry: null, exit: null },
    cameraLayoutPreset: kind !== 'webcam' && layout.startsWith('split-') ? 'custom' : layout,
    cameraFramingPreset: isCameraFramingPreset(input.cameraFramingPreset)
      ? input.cameraFramingPreset
      : kind === 'webcam' && value === undefined
        ? 'squircle'
        : 'custom',
    ...(kind === 'webcam'
      ? {
          cameraSplitRatio: Math.min(0.8, Math.max(0.2, finite(input.cameraSplitRatio, 0.5))),
          cameraSplitPadding: Math.min(0.08, Math.max(0, finite(input.cameraSplitPadding, 0))),
        }
      : {}),
  };
};

export const normalizeEditorPreferenceDefaults = (value: unknown): EditorPreferenceDefaults => {
  const input = record(value);
  const visualInput = record(input.visual);
  const visual = Object.fromEntries(
    (['screen', 'video', 'image', 'webcam'] as const).flatMap((kind) =>
      visualInput[kind] ? [[kind, visualDefaults(kind, visualInput[kind])]] : [],
    ),
  );
  return {
    schemaVersion: 1,
    ...(input.presentation && typeof input.presentation === 'object'
      ? { presentation: clone(input.presentation as EditorPreferenceDefaults['presentation']) }
      : {}),
    ...(Object.keys(visual).length ? { visual } : {}),
    ...(input.caption && typeof input.caption === 'object'
      ? { caption: clone(input.caption as EditorPreferenceDefaults['caption']) }
      : {}),
    ...(input.blur && typeof input.blur === 'object'
      ? { blur: clone(input.blur as EditorPreferenceDefaults['blur']) }
      : {}),
    ...(input.audio && typeof input.audio === 'object'
      ? { audio: clone(input.audio as EditorPreferenceDefaults['audio']) }
      : {}),
    ...(input.zoom && typeof input.zoom === 'object'
      ? { zoom: clone(input.zoom as EditorPreferenceDefaults['zoom']) }
      : {}),
  };
};

export function defaultsFromEditorState(
  current: EditorPreferenceDefaults,
  state: ProjectEditorState,
  selectedClip: Clip | null,
  selectedZoom: ZoomElement | null,
): EditorPreferenceDefaults {
  const next = normalizeEditorPreferenceDefaults(current);
  const { importedBackgrounds: _importedBackgrounds, ...presentation } = state.presentation;
  next.presentation = clone(presentation);
  if (selectedClip && isVisualClip(selectedClip)) {
    next.visual = { ...next.visual, [selectedClip.kind]: visualDefaults(selectedClip.kind, selectedClip) };
  } else if (selectedClip && isCaptionClip(selectedClip)) {
    next.caption = {
      style: clone(selectedClip.caption.style),
      ...(selectedClip.transform ? { transform: clone(selectedClip.transform) } : {}),
      durationMs: selectedClip.timelineDurationMs,
    };
  } else if (selectedClip && isBlurClip(selectedClip)) {
    const { transform, shape, mode, strength, feather, cornerRadius, tintOpacity, color } = selectedClip;
    next.blur = clone({ transform, shape, mode, strength, feather, cornerRadius, tintOpacity, color });
  } else if (selectedClip && isAudioClip(selectedClip)) {
    next.audio = { volume: selectedClip.volume, playbackRate: selectedClip.playbackRate };
  }
  if (selectedZoom) {
    next.zoom = {
      durationMs: selectedZoom.endMs - selectedZoom.startMs,
      depth: selectedZoom.depth,
      mode: selectedZoom.mode,
    };
  }
  return next;
}

export function applyFreshPresentationDefaults(state: ProjectEditorState, defaults: EditorPreferenceDefaults) {
  if (!defaults.presentation) return state;
  return {
    ...state,
    presentation: {
      ...state.presentation,
      ...clone(defaults.presentation),
      canvas: normalizeOutputCanvas(defaults.presentation.canvas),
      importedBackgrounds: [],
    },
  };
}

export const visualDefaultsFor = (defaults: EditorPreferenceDefaults, kind: VisualClip['kind']) =>
  defaults.visual?.[kind] ?? visualDefaults(kind, undefined);

export const visualClipDefaultProps = (
  defaults: EditorPreferenceDefaults,
  kind: VisualClip['kind'],
  durationMs: number,
) => {
  const value = visualDefaultsFor(defaults, kind);
  return {
    transform: clone(value.transform),
    appearance: clone(value.appearance),
    isMirrored: value.isMirrored,
    isMirroredY: value.isMirroredY,
    playbackRate: value.playbackRate,
    transitions: normalizeClipTransitions(value.transitions, durationMs / value.playbackRate, kind),
    cameraLayoutPreset: value.cameraLayoutPreset,
    cameraFramingPreset: value.cameraFramingPreset,
    ...(kind === 'webcam'
      ? { cameraSplitRatio: value.cameraSplitRatio ?? 0.5, cameraSplitPadding: value.cameraSplitPadding ?? 0 }
      : {}),
  };
};

export const captionDefaultsFor = (defaults: EditorPreferenceDefaults, fontSize = 42) => ({
  style: { ...createDefaultCaptionStyle(fontSize), ...defaults.caption?.style },
  transform: defaults.caption?.transform ? clone(defaults.caption.transform) : undefined,
  durationMs: Math.max(200, defaults.caption?.durationMs ?? 2_000),
});

export const audioDefaultsFor = (defaults: EditorPreferenceDefaults) => ({
  volume: Math.min(200, Math.max(0, defaults.audio?.volume ?? 100)),
  playbackRate: Math.min(4, Math.max(0.25, defaults.audio?.playbackRate ?? 1)),
});

export const blurDefaultsFor = (defaults: EditorPreferenceDefaults): NonNullable<EditorPreferenceDefaults['blur']> =>
  clone(
    defaults.blur ?? {
      transform: { x: 0.35, y: 0.35, width: 0.3, height: 0.3 },
      shape: 'rectangle',
      mode: 'blur',
      strength: 60,
      feather: 0,
      cornerRadius: 0,
      tintOpacity: 0,
      color: '#000000',
    },
  );
