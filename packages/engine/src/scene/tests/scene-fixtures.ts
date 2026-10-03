import { DEFAULT_COLOR_LAYER_STYLE } from '../../shared/color-layer-style';
import type { ColorClip, ClipComposition } from '../../shared/composition-types';
import type { SceneGroup, PropertyTrack } from '../scene-types';
export const colorClip = (id = 'a', start = 0, order = 0): ColorClip => ({
  ...DEFAULT_COLOR_LAYER_STYLE,
  id,
  kind: 'color',
  name: id,
  assetId: '',
  trackId: id,
  timelineStartMs: start,
  timelineDurationMs: 1000,
  sourceInMs: 0,
  sourceDurationMs: 1000,
  playbackRate: 1,
  order,
  enabled: true,
  transitions: { entry: null, exit: null },
  fill: { kind: 'color', color: '#ff0000' },
  transform: { x: 0, y: 0, width: 1, height: 1 },
});
export const group = (id = 'g', children = ['a']): SceneGroup => ({
  id,
  children,
  space: 'scene',
  transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
  opacity: 1,
  blendMode: 'source-over',
});
export const animation = (): PropertyTrack => ({
  id: 'track',
  targetId: 'a',
  property: 'transform.x',
  interpolation: 'number',
  keyframes: [
    { timeMs: 0, value: 0 },
    { timeMs: 1000, value: 1 },
  ],
});
export const sceneDocument = (): ClipComposition & { clips: ColorClip[] } => ({
  schemaVersion: 14,
  assets: [],
  keyboardCaptionSessions: [],
  clips: [colorClip()],
  scene: { version: 1, roots: ['g'], groups: [group()] },
  animations: { version: 1, tracks: [animation()] },
});
