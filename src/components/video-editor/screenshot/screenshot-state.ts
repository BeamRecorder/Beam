import type { ScreenshotDocument, ScreenshotState } from '~/api/types/screenshot';
import type { EditorPresetSettings } from '~/api/types/editor-preset';
import type { NormalizedTransform, ShapeClip } from '~/media/shared/composition-types';
import type { ShapeLayerPreset } from '~/media/shared/shape-layer-types';
import { createDefaultClipAppearance } from '~/media/shared/composition-defaults';
import { normalizeShapeLayerStyle } from '~/media/shared/shape-layer-style';
import { normalizeOutputCanvas } from '../canvas/output-canvas';
import {
  BACKGROUND_MEDIA,
  findMatchingBackgroundMedia,
  normalizeBackgroundValue,
} from '../composables/backgroundCatalog';
import type { BackgroundMedia } from '../composables/backgroundCatalog';
import type { ResizeCorner } from '~/ui/ResizeHandle/types';
import { initializeScreenshotComposition } from './screenshot-layers';

export function screenshotState(document: ScreenshotDocument, backgrounds: BackgroundMedia[] = []): ScreenshotState {
  if (document.state) {
    const state = structuredClone(document.state);
    initializeScreenshotComposition(state);
    return state;
  }
  const defaults = document.preset.editor;
  const presentation = defaults.presentation;
  const visual = defaults.visual?.image ?? defaults.visual?.screen;
  const canvas = normalizeOutputCanvas(presentation?.canvas);
  // The initial image canvas follows the actual captured aspect ratio. Named presets can choose a fixed output size.
  const customSize = document.preset.export.resolution === 'custom';
  if (!customSize) {
    canvas.preset = 'custom';
    canvas.width = document.width;
    canvas.height = document.height;
  }
  return {
    canvas,
    background:
      normalizeBackgroundValue(presentation?.background) ??
      findMatchingBackgroundMedia([...backgrounds, ...BACKGROUND_MEDIA], presentation?.selectedBackgroundId ?? null),
    blurPercent: presentation?.blurPercent ?? 0,
    image: {
      id: 'screenshot',
      kind: 'image',
      name: document.name,
      assetId: document.id,
      timelineStartMs: 0,
      timelineDurationMs: 1,
      sourceInMs: 0,
      sourceDurationMs: 1,
      playbackRate: 1,
      enabled: true,
      order: 1,
      transform: visual?.transform ?? { x: 0, y: 0, width: 1, height: 1 },
      appearance: { ...createDefaultClipAppearance('image'), ...visual?.appearance },
      isMirrored: visual?.isMirrored ?? false,
      isMirroredY: visual?.isMirroredY ?? false,
      cameraFramingPreset: 'fit',
    },
    shapes: [],
    format: document.preset.export.format === 'webp' ? 'webp' : 'png',
    quality: typeof document.preset.export.quality === 'number' ? document.preset.export.quality : 0.95,
  };
}

export function screenshotPresetSettings(state: ScreenshotState, previous: EditorPresetSettings): EditorPresetSettings {
  return {
    ...previous,
    editor: {
      schemaVersion: 1,
      presentation: {
        ...previous.editor.presentation!,
        canvas: state.canvas,
        selectedBackgroundId: state.background?.id ?? null,
        background: state.background,
        blurPercent: state.blurPercent,
      },
      visual: {
        image: {
          transform: state.image.transform,
          appearance: state.image.appearance,
          isMirrored: state.image.isMirrored,
          isMirroredY: state.image.isMirroredY,
          playbackRate: 1,
          transitions: { entry: null, exit: null },
          cameraLayoutPreset: 'custom',
          cameraFramingPreset: 'fit',
        },
      },
    },
    export: { format: state.format, quality: state.quality, resolution: 'custom' },
  };
}

export function screenshotShape(preset: ShapeLayerPreset, id: string): ShapeClip {
  return {
    ...normalizeShapeLayerStyle({ family: preset === 'arrow' ? 'arrow' : 'shape', preset }),
    id,
    assetId: id,
    kind: 'shape',
    name: preset,
    timelineStartMs: 0,
    timelineDurationMs: 1,
    sourceInMs: 0,
    sourceDurationMs: 1,
    playbackRate: 1,
    enabled: true,
    order: 0,
    transform: { x: 0.3, y: 0.3, width: 0.4, height: preset === 'arrow' ? 0.16 : 0.3 },
  };
}

export function moveScreenshotLayer(
  initial: NormalizedTransform,
  dx: number,
  dy: number,
  corner?: ResizeCorner,
): NormalizedTransform {
  if (!corner)
    return {
      ...initial,
      x: Math.max(-initial.width + 0.01, Math.min(0.99, initial.x + dx)),
      y: Math.max(-initial.height + 0.01, Math.min(0.99, initial.y + dy)),
    };
  const left = corner.includes('left'),
    top = corner.includes('top');
  const width = Math.max(0.02, Math.min(2, initial.width + (left ? -dx : corner.includes('right') ? dx : 0)));
  const height = Math.max(0.02, Math.min(2, initial.height + (top ? -dy : corner.includes('bottom') ? dy : 0)));
  return {
    x: initial.x + (left ? initial.width - width : 0),
    y: initial.y + (top ? initial.height - height : 0),
    width,
    height,
  };
}
