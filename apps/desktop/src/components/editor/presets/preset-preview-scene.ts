import type { PresetKind } from '@beam/engine/capture/capture-mode';
import type { EditorPresetSettings } from '~/api/types/editor-preset';
import type { PresetPreviewScene } from '@beam/runtime/presets/preset-preview-types';
import { normalizeOutputCanvas } from '@beam/engine/layout/output-canvas';
import { createDefaultClipAppearance } from '@beam/engine/shared/composition-defaults';
import {
  BACKGROUND_MEDIA,
  findMatchingBackgroundMedia,
  normalizeBackgroundValue,
} from '../composables/backgroundCatalog';

export function presetPreviewScene(
  settings: EditorPresetSettings,
  kind: PresetKind,
  source: { width: number; height: number },
): PresetPreviewScene {
  const presentation = settings.editor.presentation;
  const canvas = normalizeOutputCanvas(presentation?.canvas);
  const visualKind = kind === 'video' ? 'screen' : 'image';
  const visual =
    settings.editor.visual?.[visualKind] ?? (kind === 'screenshot' ? settings.editor.visual?.screen : undefined);
  if (kind === 'screenshot' && settings.export.resolution !== 'custom') {
    canvas.preset = 'custom';
    canvas.width = source.width;
    canvas.height = source.height;
  }
  return {
    canvas,
    background:
      normalizeBackgroundValue(presentation?.background) ??
      findMatchingBackgroundMedia(BACKGROUND_MEDIA, presentation?.selectedBackgroundId),
    blurPercent: presentation?.blurPercent ?? 0,
    visual: {
      id: 'preset-preview',
      assetId: 'preset-preview',
      name: 'Beam',
      kind: visualKind,
      timelineStartMs: 0,
      timelineDurationMs: 1,
      sourceInMs: 0,
      sourceDurationMs: 1,
      playbackRate: 1,
      enabled: true,
      order: 0,
      transform: visual?.transform ?? { x: 0, y: 0, width: 1, height: 1 },
      appearance: { ...createDefaultClipAppearance(visualKind, canvas.showBackground), ...visual?.appearance },
      isMirrored: visual?.isMirrored ?? false,
      isMirroredY: visual?.isMirroredY ?? false,
      rotation: visual?.rotation,
      cameraFramingPreset: kind === 'screenshot' ? 'fit' : (visual?.cameraFramingPreset ?? 'custom'),
    },
  };
}
