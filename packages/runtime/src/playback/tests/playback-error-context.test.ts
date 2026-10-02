import { describe, expect, it } from 'vitest';
import { isMediaErrorContext } from '@beam/runtime/playback/playback-error-context';
import { isPlaybackWorkerResponse } from '@beam/runtime/playback/playback-protocol';

describe('playback error context protocol', () => {
  it('accepts complete serializable decoder context and legacy errors', () => {
    const context = {
      operation: 'seek-frame',
      errorName: 'EncodingError',
      causeMessage: 'flush',
      clipId: 'screen',
      timelineSeconds: 0,
      sourceSeconds: 0,
      codec: 'av01.0.08M.08',
      codedWidth: 1920,
      codedHeight: 1052,
      hardwareAcceleration: 'prefer-software',
      optimizeForLatency: false,
    };
    expect(isMediaErrorContext(context)).toBe(true);
    const error = { kind: 'decode-failure', sourceId: 'screen', message: 'Error during flush.' };
    expect(isPlaybackWorkerResponse({ type: 'error', generation: 1, error: { ...error, context } })).toBe(true);
    expect(isPlaybackWorkerResponse({ type: 'error', generation: 1, error })).toBe(true);
  });
  it.each(['open-media', 'inspect-track', 'configure-decoder', 'reset-decoder', 'seek-frame', 'decode-frame'])(
    'accepts minimal known operation %s',
    (operation) => {
      expect(isMediaErrorContext({ operation })).toBe(true);
    },
  );
  it.each([null, undefined, 'seek', {}, { operation: 'unknown' }])('rejects invalid context %j', (context) => {
    expect(isMediaErrorContext(context)).toBe(false);
  });
  it.each([
    ['errorName', 1],
    ['causeMessage', {}],
    ['clipId', null],
    ['timelineSeconds', NaN],
    ['timelineSeconds', -1],
    ['sourceSeconds', Infinity],
    ['codedWidth', '1920'],
    ['codedHeight', -1],
    ['codec', 123],
    ['hardwareAcceleration', 'sometimes'],
    ['hardwareAcceleration', { toString: () => 'prefer-hardware' }],
    ['optimizeForLatency', 'true'],
  ])('rejects malformed %s', (field, value) => {
    const context = { operation: 'seek-frame', [field]: value };
    expect(isMediaErrorContext(context)).toBe(false);
    expect(
      isPlaybackWorkerResponse({
        type: 'error',
        generation: 1,
        error: { kind: 'decode-failure', sourceId: 'screen', message: 'decode', context },
      }),
    ).toBe(false);
  });
  it.each(['no-preference', 'prefer-hardware', 'prefer-software'])(
    'accepts decoder preference %s and unknown codec',
    (hardwareAcceleration) => {
      expect(isMediaErrorContext({ operation: 'configure-decoder', hardwareAcceleration, codec: null })).toBe(true);
    },
  );
  it('preserves a negative mapped source position as diagnostic evidence of an invalid seek', () => {
    expect(isMediaErrorContext({ operation: 'seek-frame', timelineSeconds: 0, sourceSeconds: -0.000001 })).toBe(true);
  });
});
