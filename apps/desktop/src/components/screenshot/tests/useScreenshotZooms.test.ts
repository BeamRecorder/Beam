import { describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { createStillDocument } from '@beam/engine/screenshot/still-document';
import type { ScreenshotState } from '@beam/engine/screenshot/screenshot-types';
import { useScreenshotZooms } from '../useScreenshotZooms';
const setup = () => { const state = ref<ScreenshotState | null>(createStillDocument('still', 'image.png', 1920, 1080).state), id = ref<string | null>(null), editable = ref(true); const select = vi.fn((value: string) => id.value = value); return { state, id, editable, select, zooms: useScreenshotZooms(state, id, select, () => editable.value) }; };
describe('still zoom editing', () => {
  it('inserts a manual static composition layer and selects the shared inspector', () => {
    const { zooms, state, select } = setup(); expect(zooms.selected.value).toBeNull(); zooms.add('Zoom');
    expect(state.value!.zooms![0]).toMatchObject({ kind: 'zoom', mode: 'manual', startMs: 0, endMs: 1, name: 'Zoom' });
    expect(select).toHaveBeenCalledOnce(); expect(zooms.selected.value).not.toBeNull();
    state.value!.composition = undefined; expect(zooms.selected.value!.locked).toBe(false);
  });
  it('updates common settings while retaining static timing and respecting each layer lock', () => {
    const { zooms, state, id } = setup(); zooms.add('Zoom'); const first = zooms.selected.value!;
    zooms.update({ ...first, depth: 5, mode: 'auto', startMs: 999, endMs: 2000 });
    expect(state.value!.zooms![0]).toMatchObject({ depth: 5, mode: 'manual', startMs: 0, endMs: 1 });
    state.value!.composition!.find(layer => layer.id === first.id)!.locked = true;
    expect(zooms.selected.value!.locked).toBe(true); id.value = null;
    zooms.update({ ...first, depth: 2 }); expect(state.value!.zooms![0]!.depth).toBe(5);
    zooms.update({ ...first, id: 'missing' }); expect(state.value!.zooms).toHaveLength(1);
  });
  it('does no writes while disabled or before a still document is loaded', () => {
    const { zooms, state, editable } = setup(); editable.value = false; zooms.add('Zoom'); expect(state.value!.zooms).toBeUndefined();
    editable.value = true; state.value = null; zooms.add('Zoom'); expect(zooms.selected.value).toBeNull();
  });
});
