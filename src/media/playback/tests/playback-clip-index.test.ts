import { describe, expect, it } from 'vitest';
import type { AudioClip, Clip, ClipComposition, VisualClip } from '../../shared/composition-types';
import { createDefaultClipAppearance } from '../../shared/composition-defaults';
import { createPlaybackClipIndex } from '../playback-clip-index';

const makeComposition = (...clips: Clip[]): ClipComposition => ({
  schemaVersion: 6,
  assets: [],
  clips,
  keyboardCaptionSessions: [],
});

const visualClip = (id: string, overrides: Partial<VisualClip> = {}): VisualClip => ({
  id,
  kind: 'video',
  name: id,
  assetId: 'asset-a',
  timelineStartMs: 0,
  timelineDurationMs: 1_000,
  sourceInMs: 0,
  sourceDurationMs: 1_000,
  playbackRate: 1,
  enabled: true,
  order: 0,
  trackId: 'screen-track',
  transform: { x: 0, y: 0, width: 1, height: 1 },
  appearance: createDefaultClipAppearance('video'),
  isMirrored: false,
  isMirroredY: false,
  ...overrides,
});

const audioClip = (id: string, overrides: Partial<AudioClip> = {}): AudioClip => ({
  id,
  kind: 'audio',
  name: id,
  assetId: 'asset-a',
  timelineStartMs: 0,
  timelineDurationMs: 1_000,
  sourceInMs: 0,
  sourceDurationMs: 1_000,
  playbackRate: 1,
  enabled: true,
  order: 0,
  trackId: 'screen-track',
  role: 'system',
  volume: 1,
  ...overrides,
});

const isVisual = (clip: Clip): clip is VisualClip =>
  clip.kind === 'screen' || clip.kind === 'video' || clip.kind === 'image' || clip.kind === 'webcam';

/** Models the old composition.find behavior, including original-order ties and first duplicate IDs. */
function oldFindOracle(clips: readonly Clip[]) {
  const byId = new Map<string, Clip>();
  for (const clip of clips) if (!byId.has(clip.id)) byId.set(clip.id, clip);

  const previous = new Map<string, string>();
  const visitedTargets = new Set<string>();
  for (const target of clips) {
    if (visitedTargets.has(target.id)) continue;
    visitedTargets.add(target.id);
    if (!isVisual(target)) continue;
    const match = clips.find(
      (candidate) =>
        candidate.enabled &&
        isVisual(candidate) &&
        candidate.trackId === target.trackId &&
        candidate.assetId === target.assetId &&
        candidate.timelineStartMs + candidate.timelineDurationMs === target.timelineStartMs,
    );
    if (match) previous.set(target.id, match.id);
  }
  return { clips: byId, previous };
}

describe('createPlaybackClipIndex', () => {
  it('returns empty maps for null and empty compositions', () => {
    expect(createPlaybackClipIndex(null)).toEqual({ clips: new Map(), previous: new Map() });
    expect(createPlaybackClipIndex(makeComposition())).toEqual({ clips: new Map(), previous: new Map() });
  });

  it('matches the original find semantics for visual predecessors, including image clips and ties', () => {
    const disabledSource = visualClip('disabled-source', { enabled: false, order: -10 });
    const audioMatch = audioClip('audio-match', { order: -9 });
    const imageSource = visualClip('image-source', { kind: 'image', order: 50 });
    const tiedSource = visualClip('tied-source', { order: -100 });
    const wrongAsset = visualClip('wrong-asset', { assetId: 'asset-b' });
    const wrongTrack = visualClip('wrong-track', { trackId: 'camera-track' });
    const offByOne = visualClip('off-by-one', { timelineDurationMs: 999 });
    const target = visualClip('target', { timelineStartMs: 1_000, order: 100 });
    const disabledTarget = visualClip('disabled-target', {
      enabled: false,
      kind: 'image',
      timelineStartMs: 1_000,
    });
    const imageTarget = visualClip('image-target', { kind: 'image', timelineStartMs: 1_000 });
    const gapTarget = visualClip('gap-target', { timelineStartMs: 1_000.5 });
    const value = makeComposition(
      disabledSource,
      audioMatch,
      imageSource,
      tiedSource,
      wrongAsset,
      wrongTrack,
      offByOne,
      target,
      disabledTarget,
      imageTarget,
      gapTarget,
    );
    const index = createPlaybackClipIndex(value);

    expect(index.clips).toEqual(oldFindOracle(value.clips).clips);
    expect(index.previous).toEqual(oldFindOracle(value.clips).previous);
    expect(index.previous.get(target.id)).toBe(imageSource.id);
    expect(index.previous.get(disabledTarget.id)).toBe(imageSource.id);
    expect(index.previous.get(imageTarget.id)).toBe(imageSource.id);
    expect(index.previous.has(gapTarget.id)).toBe(false);
  });

  it('preserves first clip and target records when IDs are duplicated', () => {
    const duplicateFirst = audioClip('duplicate', { name: 'first occurrence' });
    const duplicateLater = visualClip('duplicate', {
      name: 'later occurrence',
      assetId: 'different-asset',
      trackId: 'different-track',
    });
    const firstSource = visualClip('first-source', { assetId: 'first-asset', trackId: 'first-track' });
    const laterSource = visualClip('later-source', {
      assetId: 'later-asset',
      trackId: 'later-track',
      timelineDurationMs: 2_000,
    });
    const firstTarget = visualClip('duplicate-target', {
      assetId: 'first-asset',
      trackId: 'first-track',
      timelineStartMs: 1_000,
    });
    const laterTarget = visualClip('duplicate-target', {
      assetId: 'later-asset',
      trackId: 'later-track',
      timelineStartMs: 2_000,
    });
    const value = makeComposition(duplicateFirst, duplicateLater, firstSource, laterSource, firstTarget, laterTarget);
    const index = createPlaybackClipIndex(value);

    expect(index.clips.get('duplicate')).toBe(duplicateFirst);
    expect(index.clips.get('duplicate-target')).toBe(firstTarget);
    expect(index.previous.get('duplicate-target')).toBe(firstSource.id);
  });
});
