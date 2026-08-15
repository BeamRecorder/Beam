import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  assertPlaybackWorkerRequest,
  assertPlaybackWorkerResponse,
  isPlaybackWorkerRequest,
  isPlaybackWorkerResponse,
} from '../playback-protocol';

class TestImageBitmap {
  close = vi.fn();
}

const bitmap = () => new TestImageBitmap() as unknown as ImageBitmap;

const source = (overrides: Record<string, unknown> = {}) => ({
  assetId: 'asset-1',
  kind: 'video',
  url: 'project-media://asset-1/video.mp4',
  label: 'Video',
  ...overrides,
});

const clip = (overrides: Record<string, unknown> = {}) => ({
  clipId: 'clip-1',
  assetId: 'asset-1',
  timelineStartSeconds: 0,
  timelineDurationSeconds: 2,
  sourceInSeconds: 0,
  playbackRate: 1,
  ...overrides,
});

const metrics = (overrides: Record<string, unknown> = {}) => ({
  decodedFrames: 10,
  presentedFrames: 8,
  droppedFrames: 1,
  supersededRequests: 0,
  queueSize: 1,
  cacheBytes: 128,
  disposedBitmaps: 2,
  seekLatencyMs: [1, 2.5],
  ...overrides,
});

const mediaError = (overrides: Record<string, unknown> = {}) => ({
  kind: 'missing',
  sourceId: 'asset-1',
  message: 'Missing media',
  ...overrides,
});

beforeAll(() => vi.stubGlobal('ImageBitmap', TestImageBitmap));
afterAll(() => vi.unstubAllGlobals());

describe('isPlaybackWorkerRequest', () => {
  it('accepts the lifecycle request variants', () => {
    expect(isPlaybackWorkerRequest({ type: 'load', generation: 0, assets: [], clips: [] })).toBe(true);
    expect(isPlaybackWorkerRequest({ type: 'pause', generation: 3 })).toBe(true);
    expect(isPlaybackWorkerRequest({ type: 'dispose' })).toBe(true);
  });

  it('accepts play and tick with finite non-negative timeline positions', () => {
    expect(isPlaybackWorkerRequest({ type: 'play', generation: 4, timelineSeconds: 0 })).toBe(true);
    expect(isPlaybackWorkerRequest({ type: 'tick', generation: 4, timelineSeconds: Number.MAX_VALUE })).toBe(true);
    expect(isPlaybackWorkerRequest({ type: 'play', generation: Number.MAX_SAFE_INTEGER, timelineSeconds: 1.25 })).toBe(
      true,
    );
  });

  it('accepts seek requests for both modes and complete load descriptors', () => {
    expect(
      isPlaybackWorkerRequest({ type: 'seek', generation: 1, requestId: 0, timelineSeconds: 0, mode: 'seek' }),
    ).toBe(true);
    expect(
      isPlaybackWorkerRequest({
        type: 'seek',
        generation: 1,
        requestId: Number.MAX_SAFE_INTEGER,
        timelineSeconds: 2.5,
        mode: 'scrub',
      }),
    ).toBe(true);
    expect(
      isPlaybackWorkerRequest({
        type: 'load',
        generation: 1,
        assets: [source(), source({ assetId: 'asset-2', url: 'https://example.test/video.mp4' })],
        clips: [clip(), clip({ clipId: 'clip-2', playbackRate: 4 })],
      }),
    ).toBe(true);
  });

  it('accepts the inclusive playback-rate and non-negative time boundaries', () => {
    const boundaryClip = (overrides: Record<string, unknown>) =>
      isPlaybackWorkerRequest({ type: 'load', generation: 0, assets: [source()], clips: [clip(overrides)] });

    expect(boundaryClip({ playbackRate: 0.25, timelineStartSeconds: 0, sourceInSeconds: 0 })).toBe(true);
    expect(boundaryClip({ playbackRate: 4, timelineDurationSeconds: Number.MIN_VALUE })).toBe(true);
    expect(boundaryClip({ timelineStartSeconds: Number.MAX_VALUE, sourceInSeconds: Number.MAX_VALUE })).toBe(true);
  });

  it('rejects unknown, null, and incomplete request objects', () => {
    expect(isPlaybackWorkerRequest(null)).toBe(false);
    expect(isPlaybackWorkerRequest({})).toBe(false);
    expect(isPlaybackWorkerRequest({ type: 'rewind', generation: 0 })).toBe(false);
  });

  it('rejects invalid generation, timeline, and seek identifiers', () => {
    const invalid = [
      { type: 'pause', generation: -1 },
      { type: 'pause', generation: 1.5 },
      { type: 'pause', generation: Number.MAX_SAFE_INTEGER + 1 },
      { type: 'play', generation: 0, timelineSeconds: -0.001 },
      { type: 'tick', generation: 0, timelineSeconds: Number.NaN },
      { type: 'seek', generation: 0, requestId: -1, timelineSeconds: 0, mode: 'seek' },
      { type: 'seek', generation: 0, requestId: 1.1, timelineSeconds: 0, mode: 'seek' },
    ];

    for (const request of invalid) expect(isPlaybackWorkerRequest(request)).toBe(false);
    expect(isPlaybackWorkerRequest({ type: 'pause', generation: Infinity })).toBe(false);
  });

  it('rejects malformed clips, sources, and seek modes', () => {
    const invalidClip = (overrides: Record<string, unknown>) =>
      isPlaybackWorkerRequest({ type: 'load', generation: 0, assets: [source()], clips: [clip(overrides)] });
    const invalidSource = (overrides: Record<string, unknown>) =>
      isPlaybackWorkerRequest({ type: 'load', generation: 0, assets: [source(overrides)], clips: [clip()] });

    expect(invalidClip({ playbackRate: 0.249 })).toBe(false);
    expect(invalidClip({ playbackRate: 4.001, timelineDurationSeconds: 1 })).toBe(false);
    expect(invalidClip({ timelineStartSeconds: -1, sourceInSeconds: 0 })).toBe(false);
    expect(invalidClip({ timelineDurationSeconds: 0 })).toBe(false);
    expect(invalidClip({ sourceInSeconds: Number.POSITIVE_INFINITY })).toBe(false);
    expect(invalidSource({ kind: 'image' })).toBe(false);
    expect(invalidSource({ kind: 'audio' })).toBe(false);
    expect(invalidSource({ url: 'file:///video.mp4' })).toBe(false);
    expect(invalidSource({ url: 'ftp://example.test/video.mp4' })).toBe(false);
    expect(invalidSource({ assetId: '' })).toBe(false);
    expect(invalidSource({ url: 42 })).toBe(false);
    expect(invalidSource({ label: undefined })).toBe(false);
    expect(invalidSource({ label: '' })).toBe(false);
    expect(isPlaybackWorkerRequest({ type: 'load', generation: 0, assets: [{}], clips: [] })).toBe(false);
    expect(
      isPlaybackWorkerRequest({ type: 'seek', generation: 0, requestId: 0, timelineSeconds: 0, mode: 'jump' }),
    ).toBe(false);
  });
});

describe('isPlaybackWorkerResponse', () => {
  it('accepts ready responses at both generation boundaries', () => {
    expect(isPlaybackWorkerResponse({ type: 'ready', generation: 0 })).toBe(true);
    expect(isPlaybackWorkerResponse({ type: 'ready', generation: Number.MAX_SAFE_INTEGER })).toBe(true);
    expect(isPlaybackWorkerResponse({ type: 'ready', generation: 12, extra: 'ignored' })).toBe(true);
  });

  it('accepts disposed acknowledgements at both generation boundaries', () => {
    expect(isPlaybackWorkerResponse({ type: 'disposed', generation: 0 })).toBe(true);
    expect(isPlaybackWorkerResponse({ type: 'disposed', generation: Number.MAX_SAFE_INTEGER })).toBe(true);
  });

  it('accepts valid frame responses with optional and required frame fields', () => {
    expect(
      isPlaybackWorkerResponse({
        type: 'frame',
        generation: 1,
        clipId: 'clip-1',
        assetId: 'asset-1',
        bitmap: bitmap(),
        timestampSeconds: 0,
        durationSeconds: 0.04,
      }),
    ).toBe(true);
    expect(
      isPlaybackWorkerResponse({
        type: 'frame',
        generation: 2,
        requestId: 7,
        clipId: 'clip-2',
        assetId: 'asset-2',
        bitmap: bitmap(),
        timestampSeconds: -10,
        durationSeconds: Number.MAX_VALUE,
      }),
    ).toBe(true);
    expect(
      isPlaybackWorkerResponse({
        type: 'frame',
        generation: 0,
        requestId: undefined,
        clipId: '',
        assetId: '',
        bitmap: bitmap(),
        timestampSeconds: Number.MIN_VALUE,
        durationSeconds: 0,
      }),
    ).toBe(true);
  });

  it('accepts both seek-result variants and finite latency values', () => {
    expect(
      isPlaybackWorkerResponse({ type: 'seek-result', generation: 1, requestId: 0, result: 'presented', latencyMs: 0 }),
    ).toBe(true);
    expect(
      isPlaybackWorkerResponse({
        type: 'seek-result',
        generation: 1,
        requestId: Number.MAX_SAFE_INTEGER,
        result: 'superseded',
        latencyMs: -5,
      }),
    ).toBe(true);
    expect(
      isPlaybackWorkerResponse({
        type: 'seek-result',
        generation: 1,
        requestId: 3,
        result: 'presented',
        latencyMs: Number.MAX_VALUE,
      }),
    ).toBe(true);
  });

  it('accepts complete metrics and every supported error shape', () => {
    expect(isPlaybackWorkerResponse({ type: 'metrics', generation: 1, metrics: metrics() })).toBe(true);
    expect(isPlaybackWorkerResponse({ type: 'metrics', generation: 1, metrics: metrics({ seekLatencyMs: [] }) })).toBe(
      true,
    );
    expect(
      isPlaybackWorkerResponse({ type: 'metrics', generation: 1, metrics: metrics({ cacheBytes: Number.MAX_VALUE }) }),
    ).toBe(true);
    expect(isPlaybackWorkerResponse({ type: 'error', generation: 1, error: mediaError() })).toBe(true);
    expect(
      isPlaybackWorkerResponse({
        type: 'error',
        generation: 1,
        requestId: 4,
        error: mediaError({ kind: 'decode-failure', cause: new Error('decode') }),
      }),
    ).toBe(true);
    expect(
      isPlaybackWorkerResponse({ type: 'error', generation: 1, error: mediaError({ kind: 'invalid-container' }) }),
    ).toBe(true);
    expect(isPlaybackWorkerResponse({ type: 'error', generation: 1, error: mediaError({ kind: 'empty' }) })).toBe(true);
    expect(isPlaybackWorkerResponse({ type: 'error', generation: 1, error: mediaError({ kind: 'disposed' }) })).toBe(
      true,
    );
    expect(
      isPlaybackWorkerResponse({
        type: 'error',
        generation: 1,
        error: mediaError({ kind: 'missing-track', track: 'audio' }),
      }),
    ).toBe(true);
    expect(
      isPlaybackWorkerResponse({
        type: 'error',
        generation: 1,
        error: mediaError({ kind: 'unsupported-codec', track: 'video', codec: null }),
      }),
    ).toBe(true);
  });

  it('rejects unknown responses and invalid generation values', () => {
    expect(isPlaybackWorkerResponse(null)).toBe(false);
    expect(isPlaybackWorkerResponse({ type: 'ready', generation: -1 })).toBe(false);
    expect(isPlaybackWorkerResponse({ type: 'ready', generation: 1.1 })).toBe(false);
    expect(isPlaybackWorkerResponse({ type: 'ready', generation: Number.MAX_SAFE_INTEGER + 1 })).toBe(false);
    expect(isPlaybackWorkerResponse({ type: 'unknown', generation: 0 })).toBe(false);
  });

  it('rejects malformed frames and seek results', () => {
    const frame = {
      type: 'frame',
      generation: 0,
      clipId: 'clip',
      assetId: 'asset',
      bitmap: bitmap(),
      timestampSeconds: 0,
      durationSeconds: 1,
    };
    expect(isPlaybackWorkerResponse({ ...frame, bitmap: {} })).toBe(false);
    expect(isPlaybackWorkerResponse({ ...frame, timestampSeconds: Infinity })).toBe(false);
    expect(isPlaybackWorkerResponse({ ...frame, durationSeconds: Number.NaN })).toBe(false);
    expect(isPlaybackWorkerResponse({ ...frame, clipId: 1 })).toBe(false);
    expect(
      isPlaybackWorkerResponse({
        type: 'seek-result',
        generation: 0,
        requestId: -1,
        result: 'presented',
        latencyMs: 1,
      }),
    ).toBe(false);
    expect(
      isPlaybackWorkerResponse({
        type: 'seek-result',
        generation: 0,
        requestId: 1.2,
        result: 'presented',
        latencyMs: 1,
      }),
    ).toBe(false);
    expect(
      isPlaybackWorkerResponse({ type: 'seek-result', generation: 0, requestId: 1, result: 'unknown', latencyMs: 1 }),
    ).toBe(false);
    expect(
      isPlaybackWorkerResponse({
        type: 'seek-result',
        generation: 0,
        requestId: 1,
        result: 'presented',
        latencyMs: Infinity,
      }),
    ).toBe(false);
  });

  it('rejects malformed metrics and errors', () => {
    expect(isPlaybackWorkerResponse({ type: 'metrics', generation: 0, metrics: metrics({ decodedFrames: -1 }) })).toBe(
      false,
    );
    expect(
      isPlaybackWorkerResponse({ type: 'metrics', generation: 0, metrics: metrics({ queueSize: Infinity }) }),
    ).toBe(false);
    expect(
      isPlaybackWorkerResponse({ type: 'metrics', generation: 0, metrics: metrics({ seekLatencyMs: [1, NaN] }) }),
    ).toBe(false);
    expect(
      isPlaybackWorkerResponse({ type: 'metrics', generation: 0, metrics: { ...metrics(), cacheBytes: '128' } }),
    ).toBe(false);
    expect(isPlaybackWorkerResponse({ type: 'error', generation: 0 })).toBe(false);
    expect(isPlaybackWorkerResponse({ type: 'error', generation: 0, error: { ...mediaError(), message: 1 } })).toBe(
      false,
    );
    expect(isPlaybackWorkerResponse({ type: 'error', generation: 0, error: { ...mediaError(), sourceId: null } })).toBe(
      false,
    );
    expect(isPlaybackWorkerResponse({ type: 'error', generation: 0, error: null })).toBe(false);
    expect(
      isPlaybackWorkerResponse({ type: 'error', generation: 0, error: mediaError({ kind: 'missing-track' }) }),
    ).toBe(false);
    expect(
      isPlaybackWorkerResponse({
        type: 'error',
        generation: 0,
        error: mediaError({ kind: 'missing-track', track: 'text' }),
      }),
    ).toBe(false);
    expect(
      isPlaybackWorkerResponse({ type: 'error', generation: 0, error: mediaError({ kind: 'unsupported-codec' }) }),
    ).toBe(false);
    expect(
      isPlaybackWorkerResponse({
        type: 'error',
        generation: 0,
        error: mediaError({ kind: 'unsupported-codec', track: 'video', codec: 42 }),
      }),
    ).toBe(false);
    expect(
      isPlaybackWorkerResponse({ type: 'error', generation: 0, error: mediaError({ kind: 'unknown-error' }) }),
    ).toBe(false);
  });
});

describe('assertPlaybackWorkerRequest', () => {
  it('accepts valid requests without throwing', () => {
    expect(() => assertPlaybackWorkerRequest({ type: 'dispose' })).not.toThrow();
    expect(() => assertPlaybackWorkerRequest({ type: 'pause', generation: 0 })).not.toThrow();
    expect(() =>
      assertPlaybackWorkerRequest({ type: 'seek', generation: 0, requestId: 0, timelineSeconds: 0, mode: 'scrub' }),
    ).not.toThrow();
  });

  it('throws a TypeError for null and malformed requests', () => {
    expect(() => assertPlaybackWorkerRequest(null)).toThrowError(new TypeError('Invalid playback worker request.'));
    expect(() => assertPlaybackWorkerRequest({ type: 'pause', generation: -1 })).toThrowError(TypeError);
    expect(() => assertPlaybackWorkerRequest({ type: 'play', generation: 0, timelineSeconds: -1 })).toThrowError(
      TypeError,
    );
  });

  it('throws consistently for malformed load and seek payloads', () => {
    expect(() => assertPlaybackWorkerRequest({ type: 'load', generation: 0, assets: [{}], clips: [] })).toThrowError(
      TypeError,
    );
    expect(() =>
      assertPlaybackWorkerRequest({ type: 'load', generation: 0, assets: [], clips: [{ ...clip(), playbackRate: 5 }] }),
    ).toThrowError(TypeError);
    expect(() =>
      assertPlaybackWorkerRequest({ type: 'seek', generation: 0, requestId: 0.5, timelineSeconds: 0, mode: 'seek' }),
    ).toThrowError(TypeError);
  });
});

describe('assertPlaybackWorkerResponse', () => {
  it('accepts ready, frame, and metrics responses without throwing', () => {
    expect(() => assertPlaybackWorkerResponse({ type: 'ready', generation: 0 })).not.toThrow();
    expect(() =>
      assertPlaybackWorkerResponse({
        type: 'frame',
        generation: 1,
        clipId: 'clip-1',
        assetId: 'asset-1',
        bitmap: bitmap(),
        timestampSeconds: 0,
        durationSeconds: 0.04,
      }),
    ).not.toThrow();
    expect(() => assertPlaybackWorkerResponse({ type: 'metrics', generation: 2, metrics: metrics() })).not.toThrow();
  });

  it('accepts seek-result and error responses without throwing', () => {
    expect(() =>
      assertPlaybackWorkerResponse({
        type: 'seek-result',
        generation: 3,
        requestId: 4,
        result: 'presented',
        latencyMs: 12.5,
      }),
    ).not.toThrow();
    expect(() =>
      assertPlaybackWorkerResponse({
        type: 'seek-result',
        generation: 3,
        requestId: 5,
        result: 'superseded',
        latencyMs: 0,
      }),
    ).not.toThrow();
    expect(() => assertPlaybackWorkerResponse({ type: 'error', generation: 3, error: mediaError() })).not.toThrow();
  });

  it('throws the response TypeError for null and malformed responses', () => {
    expect(() => assertPlaybackWorkerResponse(null)).toThrowError(new TypeError('Invalid playback worker response.'));
    expect(() => assertPlaybackWorkerResponse({ type: 'ready', generation: -1 })).toThrowError(TypeError);
    expect(() =>
      assertPlaybackWorkerResponse({
        type: 'seek-result',
        generation: 0,
        requestId: -1,
        result: 'presented',
        latencyMs: 1,
      }),
    ).toThrowError(TypeError);
  });

  it('throws for malformed frame, metrics, and error payloads', () => {
    expect(() =>
      assertPlaybackWorkerResponse({
        type: 'frame',
        generation: 0,
        clipId: 'clip',
        assetId: 'asset',
        bitmap: {},
        timestampSeconds: 0,
        durationSeconds: 1,
      }),
    ).toThrowError(TypeError);
    expect(() =>
      assertPlaybackWorkerResponse({ type: 'metrics', generation: 0, metrics: metrics({ queueSize: -1 }) }),
    ).toThrowError(TypeError);
    expect(() =>
      assertPlaybackWorkerResponse({ type: 'error', generation: 0, error: { ...mediaError(), message: 42 } }),
    ).toThrowError(TypeError);
  });
});
