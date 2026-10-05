import { createDefaultClipAppearance } from '../../../packages/engine/src/shared/composition-defaults';
import { DEFAULT_SHAPE_LAYER_STYLE } from '../../../packages/engine/src/shared/shape-layer-style';
import { createElementText } from '../../../packages/engine/src/shared/element-text';
import type { ShapeClip, VisualClip } from '@beam/engine/shared/composition-types';
import { transitionState } from './motion';

const timing = {
  enabled: true,
  order: 0,
  timelineStartMs: 0,
  timelineDurationMs: 8000,
  sourceInMs: 0,
  sourceDurationMs: 8000,
  playbackRate: 1,
};
export function previewClip(time: number): VisualClip {
  const state = transitionState(time);
  return {
    ...timing,
    id: 'scene',
    name: 'Beautiful Captures',
    kind: 'image',
    assetId: 'artwork',
    transform: { x: 0, y: 0, width: 1, height: 1 },
    appearance: createDefaultClipAppearance('image'),
    isMirrored: false,
    isMirroredY: false,
    transitions: state.canvas
      ? { entry: null, exit: null }
      : {
          entry: {
            preset: state.preset,
            durationMs: state.duration,
            easingPower: 3,
          },
          exit: null,
        },
  };
}
export function elementClips(time: number): ShapeClip[] {
  const state = transitionState(time);
  if (!state.text) return [];
  const shape: ShapeClip = {
    ...timing,
    timelineStartMs: 6200,
    timelineDurationMs: 1800,
    ...DEFAULT_SHAPE_LAYER_STYLE,
    id: 'shape',
    assetId: 'shape-local',
    kind: 'shape',
    name: 'Title background',
    transform: { x: 0.16, y: 0.64, width: 0.68, height: 0.25 },
    fillColor: '#19191b',
    cornerRadius: 28,
    transitions: {
      entry: { preset: { kind: 'fade' }, durationMs: 500 },
      exit: null,
    },
  };
  const text = createElementText('Made to move.');
  return [
    shape,
    {
      ...shape,
      id: 'title',
      name: 'Made to move.',
      family: 'text',
      preset: 'text',
      text: {
        ...text,
        style: {
          ...text.style,
          fontFamily: 'Hanken Grotesk',
          fontSize: 106,
          fontWeight: 800,
        },
      },
      transitions: {
        entry: { preset: { kind: 'slide', direction: 'up' }, durationMs: 500 },
        exit: null,
      },
    },
  ];
}
