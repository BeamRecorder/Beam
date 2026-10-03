// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { MediaInputError } from '../../shared/media-types';
import { playbackMediaError } from '../playback-media-error';

describe('playback service errors', () => {
  it('preserves structured media diagnostics', () => {
    const detail = { kind: 'missing' as const, sourceId: 'source', message: 'Missing source' };
    expect(playbackMediaError(new MediaInputError(detail), 'load')).toBe(detail);
  });
  it('adds the operation to ordinary service errors', () => {
    expect(playbackMediaError(new Error('codec failed'), 'audio')).toEqual({
      kind: 'decode-failure',
      sourceId: 'audio',
      message: 'codec failed',
    });
  });
  it('handles unstructured service failures explicitly', () => {
    expect(playbackMediaError(null, 'load')).toEqual({
      kind: 'decode-failure',
      sourceId: 'load',
      message: 'Playback failed.',
    });
  });
});
