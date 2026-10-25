import { describe, expect, it, vi, afterEach } from 'vitest';
import { ref, shallowRef } from 'vue';
import { useZoomTrackProperties } from '../useZoomTrackProperties';
import { createManualZoom } from '@beam/engine/zoom/manual-zoom';
const harness = () => {
  const zooms = shallowRef(
      [0, 1, 2].map((i) => ({
        ...createManualZoom(`z-${i}`, i * 2000, i * 2000 + 1000),
        id: `z-${i}`,
        focus: { cx: 0.2 + i * 0.2, cy: 0.4 },
      })),
    ),
    selected = ref<string | null>('z-0'),
    ids = ref(['z-0']);
  return { zooms, selected, ids, scope: useZoomTrackProperties(zooms, selected, ids) };
};
afterEach(() => vi.useRealTimers());
describe('zoom apply-to-all mode', () => {
  it('keeps independent edits by default and harmonizes the row when enabled', () => {
    const h = harness();
    h.zooms.value = [{ ...h.zooms.value[0]!, depth: 5 }, ...h.zooms.value.slice(1)];
    expect(h.scope.enabled.value).toBe(false);
    h.scope.enabled.value = true;
    expect(h.zooms.value.every((z) => z.depth === 5)).toBe(true);
    expect(h.zooms.value[1]!.focus).toEqual({ cx: 0.4, cy: 0.4 });
    expect(h.scope.feedback.value?.clips.map((c) => c.delayMs)).toEqual([0, 75, 150]);
  });
  it('applies later appearance changes and stops when unchecked', () => {
    const h = harness();
    h.scope.enabled.value = true;
    h.zooms.value = h.scope.synchronize(h.zooms.value.map((z) => (z.id === 'z-0' ? { ...z, depth: 4 as const } : z)));
    expect(h.zooms.value[2]!.depth).toBe(4);
    h.scope.enabled.value = false;
    const next = h.zooms.value.map((z) => (z.id === 'z-0' ? { ...z, depth: 3 as const } : z));
    expect(h.scope.synchronize(next)).toBe(next);
  });
  it('does not copy focus or timing and leaves locked peers untouched', () => {
    const h = harness();
    h.zooms.value = [h.zooms.value[0]!, { ...h.zooms.value[1]!, locked: true }, h.zooms.value[2]!];
    h.scope.enabled.value = true;
    const next = h.scope.synchronize(
      h.zooms.value.map((z) =>
        z.id === 'z-0' ? { ...z, depth: 5 as const, startMs: 50, focus: { cx: 0.1, cy: 0.1 } } : z,
      ),
    );
    expect(next[1]).toBe(h.zooms.value[1]);
    expect(next[2]!.startMs).toBe(4000);
    expect(next[2]!.focus.cx).toBeCloseTo(0.6);
    expect(next[2]!.focus.cy).toBe(0.4);
  });
  it('is unavailable without a selected source or another zoom and refuses locked selections', () => {
    const h = harness();
    h.selected.value = null;
    h.ids.value = [];
    h.scope.enabled.value = true;
    expect(h.scope.enabled.value).toBe(false);
    h.selected.value = 'z-0';
    h.ids.value = ['z-0', 'z-1'];
    h.zooms.value = h.zooms.value.map((z) => (z.id === 'z-1' ? { ...z, locked: true } : z));
    expect(h.scope.disabled.value).toBe(true);
    h.scope.enabled.value = true;
    expect(h.scope.enabled.value).toBe(false);
    h.zooms.value = [h.zooms.value[0]!];
    h.ids.value = ['z-0'];
    h.scope.enabled.value = true;
    expect(h.scope.enabled.value).toBe(false);
  });
  it('resets transient mode and feedback for a new project without deleting styled zooms', () => {
    const h = harness();
    h.scope.enabled.value = true;
    h.scope.reset();
    expect(h.scope.enabled.value).toBe(false);
    expect(h.scope.feedback.value).toBeNull();
    expect(h.zooms.value).toHaveLength(3);
  });
  it('retains the original revision for unchanged styles and blocks propagation after selection is cleared or locked', () => {
    const h = harness();
    h.scope.enabled.value = true;
    const before = h.zooms.value;
    expect(h.scope.synchronize(before)).toBe(before);
    expect(h.scope.available.value).toBe(true);
    h.selected.value = null;
    expect(h.scope.available.value).toBe(false);
    expect(h.scope.synchronize(before)).toBe(before);
    h.selected.value = 'z-0';
    h.ids.value = ['z-0'];
    h.zooms.value = before.map((zoom) => (zoom.id === 'z-0' ? { ...zoom, locked: true } : zoom));
    expect(h.scope.synchronize(h.zooms.value)).toBe(h.zooms.value);
  });
});
