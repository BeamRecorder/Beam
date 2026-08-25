import { describe, expect, it } from 'vitest';
import type {
  AudioClip,
  BlurClip,
  Clip,
  ClipComposition,
  ColorClip,
  ShapeClip,
  VisualClip,
} from '~/media/shared/composition-types';
import { createDefaultClipAppearance } from '~/media/shared/composition-defaults';
import { createCompositionSceneLayerResolver, resolveCompositionSceneLayers } from '../scene-layers';

const visual = (kind: VisualClip['kind'], id: string, order: number, enabled = true, trackId = id): VisualClip => ({
  id,
  kind,
  name: id,
  assetId: `${id}-asset`,
  timelineStartMs: 0,
  timelineDurationMs: 1_000,
  sourceInMs: 0,
  sourceDurationMs: 1_000,
  playbackRate: 1,
  enabled,
  order,
  trackId,
  transform: { x: 0, y: 0, width: 1, height: 1 },
  appearance: createDefaultClipAppearance(kind),
  isMirrored: false,
  isMirroredY: false,
});

const blur = (order: number): BlurClip => ({
  id: 'blur',
  kind: 'blur',
  assetId: '',
  name: 'Blur',
  timelineStartMs: 0,
  timelineDurationMs: 1_000,
  sourceInMs: 0,
  sourceDurationMs: 1_000,
  playbackRate: 1,
  enabled: true,
  order,
  transform: { x: 0.2, y: 0.2, width: 0.3, height: 0.2 },
  shape: 'rectangle',
  mode: 'blur',
  strength: 60,
  feather: 0,
  cornerRadius: 0,
  tintOpacity: 0,
  color: '#000000',
});

const color = (order: number, id = 'color'): ColorClip => ({
  id,
  kind: 'color',
  assetId: '',
  name: 'Color',
  trackId: `${id}-track`,
  timelineStartMs: 0,
  timelineDurationMs: 1_000,
  sourceInMs: 0,
  sourceDurationMs: 1_000,
  playbackRate: 1,
  enabled: true,
  order,
  transform: { x: 0, y: 0, width: 1, height: 1 },
  fill: { kind: 'color', color: '#111827' },
});

const shape = (order: number): ShapeClip => ({
  id: 'shape',
  trackId: 'shape-track',
  kind: 'shape',
  assetId: '',
  name: 'Shape',
  timelineStartMs: 0,
  timelineDurationMs: 1_000,
  sourceInMs: 0,
  sourceDurationMs: 1_000,
  playbackRate: 1,
  enabled: true,
  order,
  transform: { x: 0.2, y: 0.2, width: 0.4, height: 0.4 },
  family: 'shape',
  preset: 'star',
  fillColor: '#ff5a1f',
  borderColor: '#ffffff',
  borderWidth: 0,
  cornerRadius: 16,
  arrowThickness: 36,
  arrowHeadSize: 38,
  rotation: 0,
  opacityEnabled: false,
  opacity: 70,
  backdropBlur: 35,
  shadowEnabled: false,
  shadowColor: '#000000',
  shadowBlur: 32,
  shadowDirection: 'bottom-right',
});

const audio = (id: string, order: number): AudioClip => ({
  id,
  kind: 'audio',
  name: id,
  assetId: `${id}-asset`,
  role: 'system',
  timelineStartMs: 0,
  timelineDurationMs: 1_000,
  sourceInMs: 0,
  sourceDurationMs: 1_000,
  playbackRate: 1,
  enabled: true,
  order,
  volume: 100,
});

const composition = (...clips: Clip[]): ClipComposition => ({
  schemaVersion: 6,
  keyboardCaptionSessions: [],
  assets: [],
  clips,
});

describe('resolveCompositionSceneLayers', () => {
  it('preserves the original order when clips share the same z-order', () => {
    const resolver = createCompositionSceneLayerResolver(
      composition(
        visual('video', 'video-first', 2),
        visual('video', 'video-second', 2),
        visual('screen', 'screen-first', 2),
        visual('screen', 'screen-second', 2),
      ),
    );

    const layers = resolver(500);

    expect(layers.screen?.id).toBe('screen-first');
    expect(layers.cameraVisuals.map((clip) => clip.id)).toEqual([
      'video-first',
      'video-second',
      'screen-first',
      'screen-second',
    ]);
    expect(layers.visualStack.map((clip) => clip.id)).toEqual([
      'video-first',
      'video-second',
      'screen-first',
      'screen-second',
    ]);
  });

  it('reuses one resolver across timeline times and follows a clip cut', () => {
    const first = visual('video', 'first', 0);
    const second = visual('video', 'second', 1);
    second.timelineStartMs = 1_000;
    const resolver = createCompositionSceneLayerResolver(composition(first, second));

    expect(resolver(500).cameraVisuals.map((clip) => clip.id)).toEqual(['first']);
    expect(resolver(999).cameraVisuals.map((clip) => clip.id)).toEqual(['first']);
    expect(resolver(1_000).cameraVisuals.map((clip) => clip.id)).toEqual(['second']);
    expect(resolver(1_500).cameraVisuals.map((clip) => clip.id)).toEqual(['second']);
  });

  it('omits audio clips from every scene layer', () => {
    const resolver = createCompositionSceneLayerResolver(composition(audio('audio', -1), visual('video', 'video', 0)));

    const layers = resolver(500);

    expect(layers.screen).toBeNull();
    expect(layers.cameraVisuals.map((clip) => clip.id)).toEqual(['video']);
    expect(layers.visualStack.map((clip) => clip.id)).toEqual(['video']);
    expect(layers.webcams).toEqual([]);
    expect(layers.captions).toEqual([]);
  });

  it('keeps assetless shape layers in the ordered visual stack', () => {
    const layers = resolveCompositionSceneLayers(composition(visual('screen', 'screen', 2), shape(1), color(0)), 500);

    expect(layers.visualStack.map((clip) => clip.id)).toEqual(['screen', 'shape', 'color']);
    expect(layers.cameraVisuals.map((clip) => clip.id)).toEqual(['screen']);
  });

  it('keeps screen recordings and imported video/image clips in global camera space', () => {
    const layers = resolveCompositionSceneLayers(
      composition(
        visual('screen', 'screen', 0),
        visual('video', 'imported-video', 2),
        visual('image', 'imported-image', 1),
        visual('webcam', 'camera', 3),
      ),
      500,
    );

    expect(layers.screen?.id).toBe('screen');
    expect(layers.cameraVisuals.map((clip) => clip.id)).toEqual(['imported-video', 'imported-image', 'screen']);
    expect(layers.webcams.map((clip) => clip.id)).toEqual(['camera']);
  });

  it('sorts each visual space independently by front-to-back order', () => {
    const layers = resolveCompositionSceneLayers(
      composition(
        visual('screen', 'screen-back', 0),
        visual('screen', 'screen-front', 5),
        visual('video', 'video-back', 1),
        visual('image', 'image-front', 4),
        visual('video', 'video-front', 6),
      ),
      500,
    );

    expect(layers.screen?.id).toBe('screen-front');
    expect(layers.cameraVisuals.map((clip) => clip.id)).toEqual([
      'video-front',
      'screen-front',
      'image-front',
      'video-back',
      'screen-back',
    ]);
  });

  it('places blur between the layers it affects and the layers that stay above it', () => {
    const layers = resolveCompositionSceneLayers(
      composition(visual('screen', 'screen', 3), visual('image', 'below', 2), blur(1), visual('webcam', 'above', 0)),
      500,
    );

    expect(layers.visualStack.map((clip) => clip.id)).toEqual(['screen', 'below', 'blur', 'above']);
  });

  it('keeps color layers in compositing z-order without exposing them as camera visuals', () => {
    const layers = resolveCompositionSceneLayers(
      composition(visual('video', 'video', 1), color(3), visual('screen', 'screen', 0)),
      500,
    );

    expect(layers.cameraVisuals.map((clip) => clip.id)).toEqual(['video', 'screen']);
    expect(layers.visualStack.map((clip) => clip.id)).toEqual(['color', 'video', 'screen']);
    expect(layers.visualStack.find((clip) => clip.kind === 'color')).toMatchObject({
      order: 3,
      transform: { x: 0, y: 0, width: 1, height: 1 },
    });
  });

  it('omits disabled and inactive clips from every scene layer', () => {
    const outside = visual('image', 'outside', 0);
    outside.timelineStartMs = 2_000;
    const disabled = visual('video', 'disabled', 1, false);

    const layers = resolveCompositionSceneLayers(
      composition(visual('screen', 'screen', 0), outside, disabled, visual('webcam', 'camera', 2)),
      500,
    );

    expect(layers.cameraVisuals.map((clip) => clip.id)).toEqual(['screen']);
    expect(layers.webcams.map((clip) => clip.id)).toEqual(['camera']);
  });

  it('keeps a split track in the same z-order when playback crosses the cut', () => {
    const layers = composition(
      visual('video', 'background', 1, true, 'background-track'),
      visual('video', 'foreground-left', 3, true, 'foreground-track'),
      visual('video', 'foreground-right', 3, true, 'foreground-track'),
    );
    const foregroundLeft = layers.clips.find((clip) => clip.id === 'foreground-left')!;
    const foregroundRight = layers.clips.find((clip) => clip.id === 'foreground-right')!;
    const background = layers.clips.find((clip) => clip.id === 'background')!;
    background.timelineDurationMs = 2_000;
    background.sourceDurationMs = 2_000;
    foregroundLeft.timelineDurationMs = 1_000;
    foregroundRight.timelineStartMs = 1_000;
    foregroundRight.sourceInMs = 1_000;
    foregroundRight.sourceDurationMs = 1_000;
    foregroundRight.timelineDurationMs = 1_000;

    expect(resolveCompositionSceneLayers(layers, 500).cameraVisuals.map((clip) => clip.id)).toEqual([
      'foreground-left',
      'background',
    ]);
    expect(resolveCompositionSceneLayers(layers, 1_500).cameraVisuals.map((clip) => clip.id)).toEqual([
      'foreground-right',
      'background',
    ]);
    expect(foregroundLeft.trackId).toBe(foregroundRight.trackId);
  });
});
