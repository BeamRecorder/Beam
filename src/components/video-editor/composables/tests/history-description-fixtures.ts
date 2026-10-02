import type { ScreenshotState } from '~/api/types/screenshot';
import type { Clip } from '@beam/engine/shared/composition-types';
import { emptyComposition } from '@beam/engine/shared/composition-types';
import { createDefaultCaptionStyle, createDefaultClipAppearance } from '@beam/engine/shared/composition-defaults';
import { createElementText } from '@beam/engine/shared/element-text';
import { DEFAULT_OUTPUT_CANVAS } from '@beam/engine/layout/output-canvas';
import { screenshotShape } from '../../screenshot/screenshot-state';
import type { EditorStateSnapshot } from '../editor-history-types';

export const videoSnapshot = (): EditorStateSnapshot => ({
  composition: emptyComposition(),
  zoomElements: [],
  outputCanvas: structuredClone(DEFAULT_OUTPUT_CANVAS),
  selectedBackground: null,
  backgroundBlurPercent: 0,
});

export const historyClip = (kind: Clip['kind'] = 'image', id = 'clip'): Clip => {
  const base = {
    id,
    kind,
    name: 'demo.png',
    timelineStartMs: 0,
    timelineDurationMs: 1000,
    sourceInMs: 0,
    sourceDurationMs: 1000,
    playbackRate: 1,
    enabled: true,
    order: 0,
  };
  const transform = { x: 0, y: 0, width: 1, height: 1 };
  if (kind === 'shape') return { ...screenshotShape('text', id), family: 'text', text: createElementText('Hello') };
  if (kind === 'caption')
    return {
      ...base,
      kind,
      caption: {
        type: 'text',
        sentences: [],
        style: { ...createDefaultCaptionStyle(), customText: 'Caption content' },
      },
    };
  if (kind === 'audio') return { ...base, kind, assetId: 'asset', role: 'imported', volume: 1 };
  if (kind === 'blur')
    return {
      ...base,
      kind,
      assetId: '',
      transform,
      shape: 'rectangle',
      mode: 'blur',
      strength: 50,
      feather: 0,
      tintOpacity: 0,
      color: '#000000',
    };
  if (kind === 'color') return { ...base, kind, assetId: '', transform, fill: { kind: 'color', color: '#ffffff' } };
  return {
    ...base,
    kind,
    assetId: 'asset',
    transform,
    appearance: createDefaultClipAppearance(kind),
    isMirrored: false,
    isMirroredY: false,
  };
};

export const screenshotSnapshot = (): ScreenshotState => {
  const image = historyClip();
  if (image.kind !== 'image') throw new Error('Expected image fixture');
  return {
    canvas: structuredClone(DEFAULT_OUTPUT_CANVAS),
    background: null,
    blurPercent: 0,
    image,
    shapes: [],
    composition: [{ id: image.id, opacity: 100, blendMode: 'source-over', locked: false }],
    format: 'png',
    quality: 0.95,
  };
};
