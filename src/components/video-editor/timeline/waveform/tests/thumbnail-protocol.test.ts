import { describe, expect, it } from 'vitest';
import {
  assertThumbnailWorkerResponse,
  isThumbnailWorkerRequest,
  isThumbnailWorkerResponse,
  uniqueSortedTimes,
  type ThumbnailWorkerResponse,
} from '~/media/playback/thumbnail-protocol';
import type { MediaSourceDescriptor } from '~/media/shared/media-types';

const source = (overrides: Partial<MediaSourceDescriptor> = {}): MediaSourceDescriptor => ({
  assetId: 'video-1',
  kind: 'video',
  url: 'project-media://asset/video-1',
  label: 'Recording',
  ...overrides,
});

const request = (
  overrides: Partial<{ generation: number; source: MediaSourceDescriptor; visibleTimes: unknown[] }> = {},
) => ({
  type: 'request-frames',
  generation: 3,
  source: source(),
  visibleTimes: [0, 1],
  ...overrides,
});

describe('thumbnail worker protocol', () => {
  it('sorts, deduplicates, and rejects invalid timestamps', () => {
    expect(uniqueSortedTimes([3, -1, 1, 3, Number.NaN, 2])).toEqual([1, 2, 3]);
  });

  it('accepts a complete project-media frame request', () => {
    expect(isThumbnailWorkerRequest(request())).toBe(true);
  });

  it('rejects filesystem, blob, data, audio, and incomplete source descriptors', () => {
    for (const url of ['file:///recording.mp4', 'blob:https://example.test/id', 'data:video/mp4;base64,AAAA']) {
      expect(isThumbnailWorkerRequest(request({ source: source({ url }) }))).toBe(false);
    }
    expect(isThumbnailWorkerRequest(request({ source: source({ kind: 'audio' }) }))).toBe(false);
    expect(isThumbnailWorkerRequest(request({ source: source({ assetId: '' }) }))).toBe(false);
    expect(isThumbnailWorkerRequest(request({ source: source({ label: '' }) }))).toBe(false);
  });

  it('rejects incomplete and malformed worker messages', () => {
    expect(isThumbnailWorkerRequest(request({ generation: 0, visibleTimes: ['1'] }))).toBe(false);
    expect(isThumbnailWorkerRequest({ type: 'clear', generation: -1 })).toBe(false);
    expect(isThumbnailWorkerRequest(null)).toBe(false);
  });

  it('accepts every valid thumbnail worker response variant', () => {
    const responses: ThumbnailWorkerResponse[] = [
      { type: 'batch-started', generation: 1 },
      { type: 'batch-finished', generation: 1 },
      { type: 'frame-ready', generation: 1, time: 0, blob: new Blob(['frame']) },
      { type: 'error', generation: 1, message: 'decoder failed' },
    ];

    for (const response of responses) {
      expect(isThumbnailWorkerResponse(response)).toBe(true);
      expect(() => assertThumbnailWorkerResponse(response)).not.toThrow();
    }
  });

  it('rejects invalid response payloads and generations', () => {
    const invalidResponses: unknown[] = [
      null,
      { type: 'batch-started', generation: -1 },
      { type: 'batch-finished', generation: 1.5 },
      { type: 'batch-finished', generation: Number.MAX_SAFE_INTEGER + 1 },
      { type: 'error', generation: 1, message: '' },
      { type: 'error', generation: 1, message: 42 },
      { type: 'frame-ready', generation: 1, time: -1, blob: new Blob(['frame']) },
      { type: 'frame-ready', generation: 1, time: Number.NaN, blob: new Blob(['frame']) },
      { type: 'frame-ready', generation: 1, time: 0, blob: 'frame' },
      { type: 'unknown', generation: 1 },
    ];

    for (const response of invalidResponses) {
      expect(isThumbnailWorkerResponse(response)).toBe(false);
      expect(() => assertThumbnailWorkerResponse(response)).toThrow(TypeError);
    }
  });
});
