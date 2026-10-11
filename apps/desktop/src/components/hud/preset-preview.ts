import { createRenderDocument } from '@beam/engine/document/render-document';
import { normalizeOutputCanvas } from '@beam/engine/layout/output-canvas';
import { createDefaultClipAppearance } from '@beam/engine/shared/composition-defaults';
import { emptyComposition, type VisualClip } from '@beam/engine/shared/composition-types';
import type { BackgroundValue } from '@beam/engine/shared/background-types';
import type { EditorPreset } from '~/api/types/editor-preset';
import type { PresetKind } from '@beam/engine/capture/capture-mode';
import { normalizeEditorPreferenceDefaults } from '../editor/composables/editor-defaults';

/** A labelled sample, never a captured project or a write to the preset collection. */
export function presetPreviewSnapshot(preset: EditorPreset, kind: PresetKind, background: BackgroundValue | null) {
  const defaults = normalizeEditorPreferenceDefaults(preset.settings.editor);
  const presentation = defaults.presentation;
  const originalCanvas = normalizeOutputCanvas(presentation?.canvas);
  const scale = Math.min(1, 720 / Math.max(originalCanvas.width, originalCanvas.height));
  const mediaKind = kind === 'screenshot' ? 'image' : 'screen';
  const visual = defaults.visual?.[mediaKind];
  const clip: VisualClip = {
    id: 'preset-sample',
    assetId: 'preset-sample',
    kind: mediaKind,
    name: 'Beam',
    timelineStartMs: 0,
    timelineDurationMs: 1000,
    sourceInMs: 0,
    sourceDurationMs: 1000,
    playbackRate: 1,
    enabled: true,
    order: 0,
    transform: { x: 0, y: 0, width: 1, height: 1 },
    appearance: createDefaultClipAppearance(mediaKind, originalCanvas.showBackground),
    isMirrored: false,
    isMirroredY: false,
    ...visual,
    // A still preview shows the finished look instead of a partial entry transition.
    transitions: { entry: null, exit: null },
  };
  const composition = emptyComposition();
  composition.clips = [clip];
  const snapshot = createRenderDocument(undefined, originalCanvas.width, originalCanvas.height);
  snapshot.composition = composition;
  snapshot.duration = 1;
  snapshot.referenceCanvas = { width: originalCanvas.width, height: originalCanvas.height };
  snapshot.canvas = {
    ...originalCanvas,
    width: Math.max(1, Math.round(originalCanvas.width * scale)),
    height: Math.max(1, Math.round(originalCanvas.height * scale)),
    transitions: { entry: null, exit: null },
  };
  snapshot.background = !background
    ? null
    : background.kind === 'color'
      ? { kind: 'color', color: background.color }
      : background.kind === 'gradient'
        ? { kind: 'gradient', gradient: background.gradient }
        : { kind: background.kind, src: background.path };
  snapshot.blurPercent = presentation?.blurPercent ?? 0;
  return snapshot;
}
