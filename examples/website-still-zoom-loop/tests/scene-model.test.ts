import { describe, expect, it } from 'vitest';
import { selectedZoom } from '../src/scene-model';
import { manualCameraZoom } from '../../../packages/engine/src/zoom/manual-zoom';
describe('Native still layers', () => {
  it.each([0, 1.5, 2.65, 3.5, 5.1, 6.9, 8.1, 9])('keeps %s a static manual Screenshot layer', time => {
    expect(selectedZoom(time)).toMatchObject({ id: 'still-detail', kind: 'zoom', mode: 'manual', startMs: 0, endMs: 1, enabled: true });
    expect(selectedZoom(time).generation).toBeUndefined();
  });
  it('changes 2D focus while keeping its zoom level fixed', () => {
    expect(selectedZoom(.55).focus.cx).toBeCloseTo(.65);
    expect(selectedZoom(1.55).focus.cx).toBeCloseTo(.5334);
    expect(selectedZoom(.55).depth).toBe(selectedZoom(1.55).depth);
  });
  it('uses actual directional presets for visible 3D perspective', () => {
    const before = selectedZoom(3), after = selectedZoom(3.5);
    expect(before.tiltPreset).toBe('tilt-back'); expect(after.tiltPreset).toBe('tilt-left');
    expect(manualCameraZoom(before).tiltX).not.toBe(0);
    expect(manualCameraZoom(after).tiltY).not.toBe(0);
  });
  it('positions a circular glass lens and applies appearance without timing', () => {
    const first = selectedZoom(6.1), moved = selectedZoom(6.8), styled = selectedZoom(8.1);
    expect(first.effect).toBe('glass'); expect(first.glass?.shape).toBe('circle');
    expect(first.glass?.transitionMs).toBe(0);
    expect(moved.focus.cx).toBeCloseTo(first.focus.cx - .1);
    expect(styled.glass?.refraction).toBeCloseTo(.35); expect(first.glass?.refraction).toBeCloseTo(.12);
    expect(styled.glass?.size).toBe(first.glass?.size);
  });
  it('produces the same document after reverse seeks and at the loop seam', () => {
    const expected = selectedZoom(6.7); selectedZoom(8.1); selectedZoom(0);
    expect(selectedZoom(6.7)).toEqual(expected); expect(selectedZoom(9)).toEqual(selectedZoom(0));
  });
});
