import {
  emptyComposition,
  type Clip,
  type ClipComposition,
  type ShapeClip,
} from '@beam/engine/shared/composition-types';
import { normalizeShapeLayerStyle } from '@beam/engine/shared/shape-layer-style';
import { createElementText } from '@beam/engine/shared/element-text';

export const textElement = (id: string, startMs = 0, trackId = id, overrides: Partial<ShapeClip> = {}): ShapeClip => ({
  ...normalizeShapeLayerStyle({ family: 'text' }),
  id,
  trackId,
  kind: 'shape',
  assetId: '',
  name: id,
  enabled: true,
  order: 0,
  timelineStartMs: startMs,
  timelineDurationMs: 1000,
  sourceDurationMs: 1000,
  sourceInMs: 0,
  playbackRate: 1,
  transitions: { entry: null, exit: null },
  transform: { x: 0.2, y: 0.3, width: 0.5, height: 0.16 },
  text: createElementText(`Text ${id}`),
  ...overrides,
});
export const textComposition = (clips: Clip[]): ClipComposition => ({ ...emptyComposition(), clips });
