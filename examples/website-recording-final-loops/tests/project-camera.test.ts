import { describe, expect, it } from 'vitest';
import { createCompositionCameraEvaluator } from '../../../packages/engine/src/zoom/composition-camera';
import type { ZoomElement } from '../../../packages/engine/src/zoom/zoom-types';
import authoredZooms from '../assets/project-camera.json';

const camera = () => createCompositionCameraEvaluator({ zooms: authoredZooms as ZoomElement[], telemetry: [] });

describe('native Projects demonstration camera', () => {
  it('starts with the full project picker and keeps a 2D camera', () => {
    expect(camera().sample(0)).toMatchObject({ scale: 1, focus: { cx: 0.5, cy: 0.5 }, tiltX: 0, tiltY: 0 });
    expect(authoredZooms[0]).toMatchObject({ projection: '2d', mode: 'manual', linkedClipId: null });
  });
  it('enlarges the selected card and keeps both action clicks visible', () => {
    const evaluator = camera();
    expect(evaluator.sample(1100).scale).toBeGreaterThan(1.5);
    for (const [ms, x, y] of [
      [2200, 458, 395],
      [3290, 418, 481],
    ] as const) {
      const sample = evaluator.sample(ms);
      expect(sample.scale).toBeGreaterThan(1.7);
      const screenX = 640 + (x - sample.focus.cx * 1280) * sample.scale;
      const screenY = 400 + (y - sample.focus.cy * 800) * sample.scale;
      expect(screenX).toBeGreaterThan(100);
      expect(screenX).toBeLessThan(1180);
      expect(screenY).toBeGreaterThan(100);
      expect(screenY).toBeLessThan(700);
    }
  });
  it('pulls back as the file browser opens and settles before selecting the original', () => {
    const evaluator = camera();
    const scales = [3300, 3600, 4000, 4400].map((ms) => evaluator.sample(ms).scale);
    expect(scales).toEqual([...scales].sort((a, b) => b - a));
    expect(evaluator.sample(4400).scale).toBeLessThan(1.05);
    expect(evaluator.sample(5050).scale).toBeCloseTo(1, 4);
    expect(evaluator.sample(5050).focus.cx).toBeCloseTo(0.5, 4);
  });
  it('matches arbitrary and reverse seeks and leaves the loop seam wide', () => {
    const evaluator = camera();
    const forward = evaluator.sample(2800);
    evaluator.sample(8000);
    evaluator.sample(0);
    expect(evaluator.sample(2800)).toEqual(forward);
    expect(evaluator.sample(8000).scale).toBeCloseTo(1, 12);
    expect(evaluator.sample(8000).focus.cx).toBeCloseTo(0.5, 12);
    expect(evaluator.sample(8000).focus.cy).toBeCloseTo(0.5, 12);
  });
});
