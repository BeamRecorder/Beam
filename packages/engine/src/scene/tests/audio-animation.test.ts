// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { AudioClip, ClipComposition } from '../../shared/composition-types';
import { createAudioGainSampler } from '../audio-animation';
import { compileSceneComposition } from '../scene-clock';
import { colorClip, group } from './scene-fixtures';
const audio = (): AudioClip => ({ ...colorClip(), kind: 'audio', role: 'imported', volume: 100 });
const document = (): ClipComposition => ({
  schemaVersion: 14,
  assets: [],
  clips: [audio()],
  keyboardCaptionSessions: [],
});
describe('shared animated audio gain', () => {
  it('samples normalization and enablement without mutating the clip', () => {
    const doc = document();
    const clip = doc.clips[0] as AudioClip;
    clip.normalization = { enabled: false, appliedGainDb: 6 } as AudioClip['normalization'];
    doc.animations = {
      version: 1,
      tracks: [
        {
          id: 'enabled',
          targetId: 'a',
          property: 'enabled',
          interpolation: 'discrete',
          keyframes: [
            { timeMs: 0, value: false },
            { timeMs: 200, value: true },
          ],
        },
        {
          id: 'normalize',
          targetId: 'a',
          property: 'normalization.enabled',
          interpolation: 'discrete',
          keyframes: [{ timeMs: 0, value: true }],
        },
        {
          id: 'db',
          targetId: 'a',
          property: 'normalization.appliedGainDb',
          interpolation: 'number',
          keyframes: [
            { timeMs: 0, value: 0 },
            { timeMs: 1000, value: 6 },
          ],
        },
      ],
    };
    const sample = createAudioGainSampler(doc, clip);
    expect(sample(0)).toBe(0);
    expect(sample(1000)).toBeCloseTo(10 ** (6 / 20));
    expect(clip.normalization?.enabled).toBe(false);
    doc.animations.tracks.pop();
    expect(createAudioGainSampler(doc, clip)(1000)).toBeCloseTo(10 ** (6 / 20));
  });
  it('retains constant gain without a property track', () => {
    const doc = document(),
      clip = audio();
    clip.volume = 50;
    expect([0, 100, 1000].map(createAudioGainSampler(doc, clip))).toEqual([0.5, 0.5, 0.5]);
    expect(createAudioGainSampler({ ...doc, clips: [] }, clip)(0)).toBe(0.5);
  });
  it('samples generic volume keyframes for forward and reverse seeks', () => {
    const doc = document();
    doc.animations = {
      version: 1,
      tracks: [
        {
          id: 'gain',
          targetId: 'a',
          property: 'volume',
          interpolation: 'number',
          keyframes: [
            { timeMs: 0, value: 0 },
            { timeMs: 1000, value: 100 },
          ],
        },
      ],
    };
    const sample = createAudioGainSampler(doc, doc.clips[0] as AudioClip);
    expect([0, 500, 1000, 250].map(sample)).toEqual([0, 0.5, 1, 0.25]);
    expect((doc.clips[0] as AudioClip).volume).toBe(100);
  });
  it('retains authored local clocks when the playback host passes compiled intervals', () => {
    const doc = document();
    doc.clips[0]!.timelineStartMs = 200;
    doc.scene = { version: 1, roots: ['g'], groups: [{ ...group(), timing: { startMs: 1000, rate: 2 } }] };
    doc.animations = {
      version: 1,
      tracks: [
        {
          id: 'gain',
          targetId: 'a',
          property: 'volume',
          timeSpace: 'local',
          interpolation: 'number',
          keyframes: [
            { timeMs: 0, value: 0 },
            { timeMs: 1000, value: 100 },
          ],
        },
      ],
    };
    const compiled = compileSceneComposition(doc);
    const sample = createAudioGainSampler(compiled, compiled.clips[0] as AudioClip);
    expect(sample(1350)).toBe(0.5);
    expect(sample(1100)).toBe(0);
  });
});
