import { describe, expect, it } from 'vitest';
import { createDefaultClipAppearance } from '~/media/shared/composition-defaults';
import { createComposition } from '../engine/clip-engine';
import type { ClipComposition, VisualClip } from '~/media/shared/composition-types';
import { prepareTimingPreview, timingPreviewFor } from '../timing-preview';
import { createCompositionSceneLayerResolver, createCompositionScreenResolver } from '../scene-layers';

const video = (id: string, start = 0, kind: VisualClip['kind'] = 'video'): VisualClip => ({
  id,
  kind,
  assetId: 'asset',
  name: id,
  timelineStartMs: start,
  timelineDurationMs: 1000,
  sourceInMs: 0,
  sourceDurationMs: 1000,
  playbackRate: 1,
  enabled: true,
  order: 0,
  trackId: id,
  transform: { x: 0, y: 0, width: 1, height: 1 },
  appearance: createDefaultClipAppearance(kind),
  isMirrored: false,
  isMirroredY: false,
});
const composition = (clips: VisualClip[]) =>
  createComposition(
    [
      {
        id: 'asset',
        kind: 'video',
        name: 'Video',
        fileName: 'video.webm',
        durationMs: 60000,
        width: 1920,
        height: 1080,
        src: 'project-media://asset/video.webm',
        origin: 'project',
      },
    ],
    clips,
  );

describe('sparse timing previews', () => {
  it('owns only moved records until a consumer requests a full snapshot', () => {
    const stationary = video('stationary'),
      moving = video('moving', 1000);
    const base = composition([stationary, moving]);
    const build = prepareTimingPreview(base, new Set(['moving']));
    const patch = { ...base.clips[1]!, timelineStartMs: 2000 };
    const preview = build([patch]);
    expect(timingPreviewFor(preview)?.patches.size).toBe(1);
    expect(preview.clips).toBe(preview.clips);
    expect(preview.clips[0]).toBe(base.clips[0]);
    expect(preview.clips[1]).toBe(patch);
    expect(base.clips[1]?.timelineStartMs).toBe(1000);
    const next = build([{ ...patch, timelineStartMs: 3000 }]);
    expect(preview.clips[1]?.timelineStartMs).toBe(2000);
    expect(next.clips[1]?.timelineStartMs).toBe(3000);
  });
  it('queries stationary intervals and moving patches with half-open cut semantics', () => {
    const base = composition([video('moving'), video('stationary', 2000)]);
    const preview = prepareTimingPreview(base, new Set(['moving']))([{ ...base.clips[0]!, timelineStartMs: 2000 }]);
    const at = timingPreviewFor(preview)!;
    expect(at.at(0)).toEqual([]);
    expect(at.at(2000).map((clip) => clip.id)).toEqual(['stationary', 'moving']);
    expect(at.at(3000)).toEqual([]);
    expect(at.at(NaN)).toEqual([]);
    expect(at.order({ ...base.clips[0]!, id: 'unknown' })).toBe(0);
    expect(timingPreviewFor(base)).toBeUndefined();
  });
  it('preserves screen-only queries, stacking, disabled media and source exhaustion', () => {
    const base = composition([video('first', 0, 'screen'), video('second', 0, 'screen'), video('video')]);
    const build = prepareTimingPreview(base, new Set(['first', 'video']));
    const patches = [
      { ...base.clips[0]!, timelineStartMs: 2000 },
      { ...base.clips[2]!, enabled: false },
    ];
    const preview = build(patches);
    expect(createCompositionScreenResolver(preview)(0)?.id).toBe('second');
    expect(createCompositionScreenResolver(preview)(2000)?.id).toBe('first');
    expect(createCompositionScreenResolver(preview)(3000)).toBeNull();
    const at = createCompositionSceneLayerResolver(preview);
    expect(at(0).visualStack.map((clip) => clip.id)).toEqual(['second']);
    const simultaneous = build([
      { ...base.clips[0]!, order: 99 },
      { ...base.clips[2]!, enabled: false },
    ]);
    expect(createCompositionScreenResolver(simultaneous)(0)?.id).toBe('first');
    const exhausted = build([
      { ...base.clips[0]!, sourceDurationMs: 0 },
      { ...(base.clips[2]! as import('~/media/shared/composition-types').VisualClip), kind: 'webcam' },
    ]);
    expect(createCompositionScreenResolver(exhausted)(0)?.id).toBe('second');
  });
  it('does not materialize the full clip list during scene and screen rendering', () => {
    const base = composition(Array.from({ length: 10000 }, (_, i) => video(String(i), i * 1000)));
    const preview = prepareTimingPreview(base, new Set(['1']))([{ ...base.clips[1]!, timelineStartMs: 1100 }]);
    Object.defineProperty(preview, 'clips', {
      get() {
        throw new Error('Full snapshot requested');
      },
    });
    expect(createCompositionSceneLayerResolver(preview)(1200).cameraVisuals[0]?.id).toBe('1');
    expect(createCompositionScreenResolver(preview)(1200)).toBeNull();
    expect(timingPreviewFor(preview)?.clip('1')?.timelineStartMs).toBe(1100);
    expect(timingPreviewFor(preview)?.clip('2')?.id).toBe('2');
    expect(timingPreviewFor(preview)?.clip('absent')).toBeUndefined();
    expect(timingPreviewFor(preview)?.visualEnabledStates().size).toBe(10000);
  });
  it('rejects a patch outside the gesture instead of corrupting an array slot', () => {
    const base = composition([video('moving'), video('other')]);
    const build = prepareTimingPreview(base, new Set(['moving', 'missing']));
    expect(() => build([video('missing')])).toThrow('Unexpected');
    expect(() => build([video('other')])).toThrow('Unexpected');
    expect(() => build([])).toThrow('Missing');
  });
  it('supports an empty document and audio-only timing patches without a visual layer', () => {
    const base: ClipComposition = {
      ...composition([]),
      clips: [
        {
          id: 'audio',
          kind: 'audio',
          assetId: 'asset',
          name: 'Audio',
          role: 'imported',
          volume: 100,
          timelineStartMs: 0,
          timelineDurationMs: 1000,
          sourceInMs: 0,
          sourceDurationMs: 1000,
          playbackRate: 1,
          enabled: true,
          order: 0,
        },
      ],
    };
    const preview = prepareTimingPreview(base, new Set(['audio']))(base.clips);
    expect(timingPreviewFor(preview)?.at(0)).toEqual([]);
    expect(createCompositionScreenResolver(preview)(0)).toBeNull();
    expect(prepareTimingPreview(composition([]), new Set())([]).clips).toEqual([]);
  });
});
