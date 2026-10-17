import { describe, expect, it } from 'vitest';
import { compositionWithZoomDuration } from './composition-duration';
import { compositionDurationMs } from '../shared/timeline-mapping';
import { emptyComposition } from '../shared/composition-types';
import { colorClip, group } from '../scene/tests/scene-fixtures';
import { validateComposition } from '../commands/clip-composition-validation';
import { createManualZoom } from '../zoom/manual-zoom';

describe('composition timeline duration', () => {
  it('keeps unextended documents by identity and does not shorten real clip timing', () => {
    const composition = { ...emptyComposition(), clips: [colorClip()] };
    expect(compositionWithZoomDuration(composition, [])).toBe(composition);
    expect(compositionWithZoomDuration(composition, [createManualZoom('zoom', 100, 800)])).toBe(composition);
    expect(compositionDurationMs({ ...composition, durationMs: 500 })).toBe(1000);
  });
  it('includes a longer zoom without modifying authored data or media timing', () => {
    const composition = { ...emptyComposition(), clips: [colorClip()] };
    const zooms = [createManualZoom('zoom', 1000, 3000)];
    const view = compositionWithZoomDuration(composition, zooms);
    expect(compositionDurationMs(view)).toBe(3000);
    expect(view.clips).toBe(composition.clips);
    expect(composition).not.toHaveProperty('durationMs');
    expect(compositionDurationMs(compositionWithZoomDuration(composition, []))).toBe(1000);
    const reopened = JSON.parse(JSON.stringify({ composition, zooms })) as {
      composition: typeof composition;
      zooms: typeof zooms;
    };
    expect(compositionDurationMs(compositionWithZoomDuration(reopened.composition, reopened.zooms))).toBe(3000);
  });
  it('supports an empty project and zero or fractional explicit durations', () => {
    expect(compositionDurationMs(emptyComposition())).toBe(0);
    expect(compositionDurationMs({ ...emptyComposition(), durationMs: 0 })).toBe(0);
    const view = compositionWithZoomDuration(emptyComposition(), [createManualZoom('zoom', 0, 2500.5)]);
    expect(compositionDurationMs(view)).toBe(2500.5);
    expect(() => validateComposition(view)).not.toThrow();
  });
  it('respects world clip times in retimed groups and already explicit durations', () => {
    const composition = {
      ...emptyComposition(),
      durationMs: 4000,
      clips: [colorClip()],
      scene: { version: 1 as const, roots: ['g'], groups: [{ ...group(), timing: { startMs: 3000, rate: 0.5 } }] },
    };
    expect(compositionDurationMs(composition)).toBe(5000);
    expect(
      compositionDurationMs(compositionWithZoomDuration(composition, [createManualZoom('zoom', 5000, 6000)])),
    ).toBe(6000);
  });
  it.each([-1, NaN, Infinity, null, '2000', true])('rejects invalid explicit duration %s', (durationMs) => {
    expect(() => validateComposition({ ...emptyComposition(), durationMs } as never)).toThrow(
      'Invalid composition duration',
    );
  });
});
