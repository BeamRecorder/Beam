// @vitest-environment node
import { expect, it } from 'vitest';
import { prepareMotionJob } from './motion-job';
import { createRenderDocument } from '@beam/engine';
const job = () => ({
  version: 1,
  entry: 'index.html',
  width: 64,
  height: 64,
  duration: 1,
  fps: 30,
  format: 'webm',
  preset: 'high',
});
it('constructs real image clips and a provider capability using shared engine authoring', () => {
  const result = prepareMotionJob(job(), '/project');
  expect(result.host).toEqual({ entry: '/project/index.html', width: 64, height: 64, assetId: 'motion:html' });
  expect(result.request.snapshot.composition.clips[0]).toMatchObject({
    trackId: 'motion:track',
    timelineDurationMs: 1000,
  });
  expect(result.request.snapshot.duration).toBe(1);
});
it('retains supplied Beam rendering/effect settings', () => {
  const snapshot = createRenderDocument(undefined, 128, 128);
  snapshot.blurPercent = 20;
  expect(prepareMotionJob({ ...job(), snapshot }, '/project').request.snapshot.canvas.width).toBe(128);
  expect(prepareMotionJob({ ...job(), snapshot }, '/project').request.snapshot.blurPercent).toBe(20);
});
it('rejects missing, invalid and duplicate motion documents', () => {
  for (const input of [
    null,
    {},
    { ...job(), version: 2 },
    { ...job(), fps: 0 },
    { ...job(), duration: 0.001 },
    { ...job(), width: 0 },
    { ...job(), entry: 'App.vue' },
    { ...job(), preset: 'unknown' },
  ])
    expect(() => prepareMotionJob(input, '/project')).toThrow();
  const result = prepareMotionJob(job(), '/project');
  expect(() => prepareMotionJob({ ...job(), snapshot: result.request.snapshot }, '/project')).toThrow('already exists');
});
