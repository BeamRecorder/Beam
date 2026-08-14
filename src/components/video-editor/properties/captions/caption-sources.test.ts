import { describe, expect, it } from 'vitest';
import { captionSources } from './caption-sources';
import type { ClipComposition } from '~/media/shared/composition-types';

const composition = (overrides: Partial<ClipComposition> = {}): ClipComposition => ({
  schemaVersion: 3,
  keyboardCaptionSessions: [],
  assets: [],
  clips: [],
  ...overrides,
});

describe('captionSources', () => {
  it('lists an audio track linked to an imported video', () => {
    const sources = captionSources(
      composition({
        assets: [
          {
            id: 'video',
            kind: 'video',
            name: 'Demo',
            fileName: 'demo.mp4',
            durationMs: 1000,
            width: 1920,
            height: 1080,
            src: 'file:///demo.mp4',
            origin: 'project',
          },
        ],
        clips: [
          {
            id: 'video-audio',
            kind: 'audio',
            name: 'Demo audio',
            assetId: 'video',
            timelineStartMs: 0,
            timelineDurationMs: 1000,
            sourceInMs: 0,
            sourceDurationMs: 1000,
            playbackRate: 1,
            enabled: true,
            order: 0,
            volume: 100,
            role: 'imported',
          },
        ],
      }),
    );

    expect(sources).toEqual([{ id: 'media:video-audio', label: 'Demo audio', src: 'file:///demo.mp4' }]);
  });

  it('lists audio tracks regardless of their media kind', () => {
    const sources = captionSources(
      composition({
        assets: [
          {
            id: 'audio',
            kind: 'audio',
            name: 'Narration',
            fileName: 'voice.mp3',
            durationMs: 1000,
            width: null,
            height: null,
            src: 'file:///voice.mp3',
            origin: 'project',
          },
        ],
        clips: [
          {
            id: 'narration',
            kind: 'audio',
            name: 'Voice-over',
            assetId: 'audio',
            timelineStartMs: 0,
            timelineDurationMs: 1000,
            sourceInMs: 0,
            sourceDurationMs: 1000,
            playbackRate: 1,
            enabled: true,
            order: 0,
            volume: 100,
            role: 'imported',
          },
        ],
      }),
    );

    expect(sources).toEqual([{ id: 'media:narration', label: 'Voice-over', src: 'file:///voice.mp3' }]);
  });

  it('ignores audio tracks whose media is unavailable', () => {
    const sources = captionSources(
      composition({
        clips: [
          {
            id: 'missing-audio',
            kind: 'audio',
            name: 'Missing',
            assetId: 'missing',
            timelineStartMs: 0,
            timelineDurationMs: 1000,
            sourceInMs: 0,
            sourceDurationMs: 1000,
            playbackRate: 1,
            enabled: true,
            order: 0,
            volume: 100,
            role: 'imported',
          },
        ],
      }),
    );

    expect(sources).toEqual([]);
  });
});
