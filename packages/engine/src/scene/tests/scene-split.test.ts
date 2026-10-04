import { expect, it } from 'vitest';
import { splitClip, validateComposition } from '../../commands/clip-engine';
import { resolveCompositionSceneLayers } from '../../composition/scene-layers';
import { createAudioGainSampler } from '../audio-animation';
import type { AudioClip } from '../../shared/composition-types';
import { sceneDocument, group, colorClip } from './scene-fixtures';

it('preserves nonlinear local keyframes across repeated splits in nested clocks', () => {
  const doc = sceneDocument();
  doc.scene!.groups[0]!.timing = { startMs: 1000, rate: 2 };
  doc.animations!.tracks[0]!.timeSpace = 'local';
  doc.animations!.tracks[0]!.keyframes[0]!.easing = 'ease-in-out';
  const once = splitClip(doc, 'a', 500, () => 'right');
  const twice = splitClip(once, 'right', 750, () => 'tail');
  for (const time of [1100, 1250, 1300, 1400, 1499, 1300]) {
    const before = resolveCompositionSceneLayers(doc, time).visualStack[0]!;
    const after = resolveCompositionSceneLayers(twice, time).visualStack[0]!;
    expect(after.transform.x).toBeCloseTo(before.transform.x, 12);
  }
  expect(twice.animations!.tracks.find((track) => track.targetId === 'tail')?.timeOffsetMs).toBe(750);
  expect(doc.animations!.tracks[0]!.timeOffsetMs).toBeUndefined();
  validateComposition(twice);
});
it('copies timeline tracks without shifting their absolute phase', () => {
  const doc = sceneDocument(),
    next = splitClip(doc, 'a', 500, () => 'right');
  expect(next.animations!.tracks[1]?.targetId).toBe('right');
  expect(next.animations!.tracks[1]?.timeOffsetMs).toBeUndefined();
  expect(resolveCompositionSceneLayers(next, 700).visualStack[0]!.transform.x).toBe(0.7);
});
it('keeps fragments in their actual group when two source clips share a timeline track', () => {
  const doc = sceneDocument();
  const left = doc.clips[0]!;
  left.timelineDurationMs = left.sourceDurationMs = 500;
  const right = {
    ...colorClip('b', 500),
    trackId: left.trackId,
    timelineDurationMs: 500,
    sourceInMs: 500,
    sourceDurationMs: 500,
  };
  doc.clips.push(right);
  doc.animations!.tracks[0]!.targetId = 'b';
  doc.scene!.groups.push(group('other', ['b']));
  doc.scene!.roots.push('other');
  const next = splitClip(doc, 'b', 750, () => 'tail');
  expect(next.scene!.groups[0]!.children).toEqual(['a']);
  expect(next.scene!.groups[1]!.children).toEqual(['b', 'tail']);
  expect(next.animations!.tracks.at(-1)?.targetId).toBe('tail');
});
it('preserves local audio automation through the same fragment phase offset', () => {
  const base = sceneDocument();
  const audio: AudioClip = { ...base.clips[0]!, kind: 'audio', assetId: 'audio', role: 'imported', volume: 100 };
  const doc = {
    ...base,
    clips: [audio],
    assets: [
      {
        id: 'audio',
        kind: 'audio' as const,
        name: 'Audio',
        fileName: 'tone.wav',
        durationMs: 1000,
        width: null,
        height: null,
        src: 'tone.wav',
        origin: 'project' as const,
      },
    ],
  };
  doc.animations!.tracks[0] = {
    ...doc.animations!.tracks[0]!,
    property: 'volume',
    timeSpace: 'local',
    keyframes: [
      { timeMs: 0, value: 0, easing: 'ease-in' },
      { timeMs: 1000, value: 100 },
    ],
  };
  const next = splitClip(doc, 'a', 500, () => 'right'),
    right = next.clips.find((clip) => clip.id === 'right') as AudioClip;
  expect(createAudioGainSampler(next, right)(750)).toBe(createAudioGainSampler(doc, audio)(750));
});
