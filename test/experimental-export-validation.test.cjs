const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  validateExperimentalRequest,
  readNativeResult,
} = require('../apps/desktop/electron/export/experimental-export-validation.cjs');
const request = () => ({
  format: 'mp4',
  preset: 'medium',
  snapshot: {
    canvas: { width: 1920, height: 1080 },
    render: { fps: 30 },
    duration: 1.01,
    composition: { clips: [], assets: [] },
  },
});
test('validates native geometry and keeps the partial final video frame', () => {
  assert.deepEqual(validateExperimentalRequest(request()), { width: 1920, height: 1080, fps: 30, frames: 31 });
  const value = request();
  value.snapshot.canvas = { width: 2, height: 8192 };
  value.snapshot.render.fps = 120;
  assert.equal(validateExperimentalRequest(value).frames, 122);
});
test('rejects invalid native requests and oversized documents', () => {
  for (const value of [null, {}, { ...request(), format: 'gif' }, { ...request(), preset: 'max' }])
    assert.throws(() => validateExperimentalRequest(value));
  for (const dimensions of [
    { width: 3, height: 2 },
    { width: 0, height: 2 },
    { width: 8194, height: 2 },
  ]) {
    const value = request();
    value.snapshot.canvas = dimensions;
    assert.throws(() => validateExperimentalRequest(value));
  }
  for (const fps of [0, 121, 1.5, NaN]) {
    const value = request();
    value.snapshot.render.fps = fps;
    assert.throws(() => validateExperimentalRequest(value));
  }
  for (const duration of [0, -1, NaN, Infinity, 86401]) {
    const value = request();
    value.snapshot.duration = duration;
    assert.throws(() => validateExperimentalRequest(value));
  }
  const value = request();
  value.snapshot.composition.assets = null;
  assert.throws(() => validateExperimentalRequest(value));
  value.snapshot.composition.assets = Array(100001).fill({});
  assert.throws(() => validateExperimentalRequest(value));
  value.snapshot.composition.assets = [];
  value.snapshot.composition.clips = Array(100001).fill({});
  assert.throws(() => validateExperimentalRequest(value));
  value.snapshot.composition.clips = [];
  value.projectName = 'x'.repeat(32 * 1024 * 1024);
  assert.throws(() => validateExperimentalRequest(value));
});
test('requires a complete hardware packet result without fabricating success', () => {
  const valid = { packets: 30, bytes: 1200, keyframes: 1, conversionMs: 4.5, encodingMs: 12 };
  assert.deepEqual(readNativeResult('BEAM_FFMPEG_READY\nBEAM_FFMPEG_RESULT=' + JSON.stringify(valid), 30), valid);
  for (const result of [
    { ...valid, packets: 29 },
    { ...valid, bytes: 0 },
    { ...valid, bytes: 1.5 },
    { ...valid, keyframes: 31 },
    { ...valid, keyframes: 0 },
    { ...valid, conversionMs: -1 },
    { ...valid, encodingMs: null },
  ])
    assert.throws(() => readNativeResult('BEAM_FFMPEG_RESULT=' + JSON.stringify(result), 30));
  assert.throws(() => readNativeResult('', 30));
  assert.throws(() => readNativeResult('BEAM_FFMPEG_RESULT={invalid', 30));
});
