import { describe, expect, it } from 'vitest';
import {
  audioPlaybackTopology,
  videoPlaybackTopology,
  PlaybackCompositionTopology,
} from '../playback-composition-topology';
import type { AudioClip, ClipComposition } from '@beam/engine/shared/composition-types';
import { asset, composition, videoClip } from './media-playback-engine.fixtures';

const audio = (id: string): AudioClip => ({
  ...videoClip(`clip-${id}`, id),
  kind: 'audio',
  role: 'imported',
  volume: 100,
});

describe('playback topology fingerprints', () => {
  it('ignores clip/asset order, timing and visual properties while detecting resource changes', () => {
    const original = composition([videoClip('a'), videoClip('b', 'unused')]);
    const reordered = {
      ...original,
      clips: [...original.clips].reverse().map((clip) => ({ ...clip, timelineStartMs: 100 })),
      assets: [...original.assets].reverse(),
    };
    expect(videoPlaybackTopology(reordered)).toBe(videoPlaybackTopology(original));
    reordered.assets[0] = { ...reordered.assets[0]!, src: 'replacement.mp4' };
    expect(videoPlaybackTopology(reordered)).not.toBe(videoPlaybackTopology(original));
  });

  it('ignores still and unused assets, but retains disabled video resources', () => {
    const doc = composition();
    const expected = videoPlaybackTopology(doc);
    doc.clips.push({ ...videoClip('still'), kind: 'image' });
    doc.assets.push(asset('ignored'));
    expect(videoPlaybackTopology(doc)).toBe(expected);
    doc.clips[0]!.enabled = false;
    expect(videoPlaybackTopology(doc)).toBe(expected);
    const clip = doc.clips[0]!;
    if (!('assetId' in clip)) throw new Error('Expected media clip');
    clip.assetId = 'unused';
    expect(videoPlaybackTopology(doc)).not.toBe(expected);
  });

  it('uses one asset pass for thousands of independent audio files and preserves missing-asset signatures', () => {
    let idReads = 0;
    const doc: ClipComposition = { ...composition([]), clips: [], assets: [] };
    for (let i = 0; i < 2000; i++) {
      const id = String(i);
      doc.clips.push(audio(id));
      doc.assets.push({
        ...asset(id),
        kind: 'audio',
        get id() {
          idReads++;
          return id;
        },
      });
    }
    const result = audioPlaybackTopology(doc);
    expect(JSON.parse(result)).toHaveLength(2000);
    expect(idReads).toBeLessThanOrEqual(4000);
    const missing = { ...doc, assets: [] };
    expect(JSON.parse(audioPlaybackTopology(missing))[0]).toEqual({ assetId: '0' });
  });

  it('deduplicates and sorts audio resources independently of non-audio clips and unused files', () => {
    const doc = { ...composition(), clips: [audio('b'), audio('a'), audio('b')], assets: [asset('b'), asset('a')] };
    const expected = audioPlaybackTopology(doc);
    doc.clips.reverse();
    doc.assets.reverse();
    expect(audioPlaybackTopology(doc)).toBe(expected);
    expect(JSON.parse(expected).map((entry: { assetId: string }) => entry.assetId)).toEqual(['a', 'b']);
    expect(JSON.parse(audioPlaybackTopology(composition()))).toEqual([]);
  });

  it('captures loaded fingerprints once without rereading the old composition on comparisons', () => {
    const doc = composition();
    const topology = new PlaybackCompositionTopology();
    expect(topology.matchesVideo(doc)).toBe(false);
    topology.capture(doc);
    const next = structuredClone(doc);
    Object.defineProperty(doc, 'clips', {
      get: () => {
        throw new Error('Loaded document was rescanned');
      },
    });
    expect(topology.matchesVideo(next)).toBe(true);
    expect(topology.updateAudio(next)).toBe(false);
    next.clips.push(audio('audio'));
    expect(topology.updateAudio(next)).toBe(true);
    expect(topology.updateAudio(next)).toBe(false);
  });

  it('detects in-place resource changes and replacement loads instead of caching by mutable identity', () => {
    const topology = new PlaybackCompositionTopology();
    const doc = composition();
    topology.capture(doc);
    doc.assets[0]!.src = 'changed.mp4';
    expect(topology.matchesVideo(doc)).toBe(false);
    topology.capture(doc);
    expect(topology.matchesVideo(doc)).toBe(true);
    const empty = composition([]);
    topology.capture(empty);
    expect(topology.matchesVideo(doc)).toBe(false);
    expect(topology.matchesVideo(empty)).toBe(true);
  });
});
