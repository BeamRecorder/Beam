// @vitest-environment node
import { expect, it } from 'vitest';
import { recordingFrameRate } from './recording-frame-rate';
it('uses screen frame rate before its legacy fps field', () => {
  expect(
    recordingFrameRate([
      { kind: 'camera', format: { fps: 120 } },
      { kind: 'screen', format: { frameRate: 60, fps: 30 } },
    ]),
  ).toBe(60);
  expect(recordingFrameRate([{ kind: 'screen', format: { fps: 24 } }])).toBe(24);
  expect(recordingFrameRate([{ kind: 'screen', format: { frameRate: null, fps: 50 } }])).toBe(50);
});
it.each([0, -1, NaN, Infinity, '60'])('rejects invalid screen frame rate %s', (frameRate) => {
  expect(recordingFrameRate([{ kind: 'screen', format: { frameRate } }])).toBe(30);
});
it('keeps the established 30fps default without video metadata', () => {
  expect(recordingFrameRate()).toBe(30);
  expect(recordingFrameRate([{ kind: 'microphone', format: {} }])).toBe(30);
  expect(recordingFrameRate([{ kind: 'screen', format: {} }])).toBe(30);
});
