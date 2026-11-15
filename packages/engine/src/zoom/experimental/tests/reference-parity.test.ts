// @vitest-environment node
import { describe, expect, it } from 'vitest';
import reference from './fixtures/reference.json';
import type { ExperimentalGenerationInputs } from '../experimental-zoom-types';
import type { ExperimentalGeometry } from '../experimental-camera-types';
import type { CompositionCameraInputs } from '../../composition-camera-types';
import { experimentalZoomSuggestions } from '../experimental-zoom-suggestions';
import { createRecordlyCamera } from '../recordly-camera';

// The committed oracle consists only of numeric inputs/outputs from the pinned upstream revision.
const generation = reference.generation as (ExperimentalGenerationInputs & { name: string; expected: unknown })[];
const camera = reference.camera as unknown as (CompositionCameraInputs & {
  name: string;
  fps: number;
  geometry?: ExperimentalGeometry;
  samples: number[][];
})[];
describe('pinned Recordly Focused algorithm parity', () => {
  it.each(generation)('generates the same interaction windows: $name', (input) => {
    const before = structuredClone(input);
    expect(
      experimentalZoomSuggestions(input).map((zoom) => ({
        ...zoom,
        start: Math.round(zoom.start),
        end: Math.round(zoom.end),
      })),
    ).toEqual(input.expected);
    expect(input).toEqual(before);
  });
  it.each(camera)('reproduces the reference camera at media cadence: $name', (input) => {
    const evaluator = createRecordlyCamera({
      ...input,
      // These legacy fixtures converted manual viewport focus into Beam canvas coordinates.
      zooms: input.geometry
        ? input.zooms.map((zoom) => (zoom.mode === 'manual' ? { ...zoom, focusSpace: undefined } : zoom))
        : input.zooms,
      frameRate: input.fps,
      experimentalGeometryAt: input.geometry ? () => input.geometry! : undefined,
    });
    for (const [timeMs, scale, cx, cy] of input.samples) {
      const actual = evaluator.sample(timeMs!);
      expect(actual.scale).toBeCloseTo(scale!, 10);
      expect(actual.focus.cx).toBeCloseTo(cx!, 10);
      expect(actual.focus.cy).toBeCloseTo(cy!, 10);
    }
    // Revisit retained checkpoints and off-grid timestamps in a different order.
    for (const index of [input.samples.length - 1, 0, 30, 10, Math.floor(input.samples.length / 2), 5]) {
      const sample = input.samples[index];
      if (!sample) continue;
      const [time, scale, cx, cy] = sample;
      evaluator.sample(time! + 0.123);
      const actual = evaluator.sample(time!);
      expect(actual.scale).toBeCloseTo(scale!, 10);
      expect(actual.focus.cx).toBeCloseTo(cx!, 10);
      expect(actual.focus.cy).toBeCloseTo(cy!, 10);
    }
    evaluator.invalidate();
    const last = input.samples.at(-1)!;
    expect(evaluator.sample(last[0]!).scale).toBeCloseTo(last[1]!, 10);
  });
});
