import { it, expect } from 'vitest';
import { createStillDocument } from '@beam/engine';
import { screenshotPaintState } from '../screenshot-paint-state';
import { createManualZoom } from '@beam/engine/zoom/manual-zoom';
it('retains the original document outside crop and zoom editing', () => {
  const state = createStillDocument('x', 'source', 100, 100).state;
  expect(screenshotPaintState(state, null, false)).toBe(state);
});
it('uncrops only the selected image without mutating its saved crop', () => {
  const state = createStillDocument('x', 'source', 100, 100).state;
  state.image.crop = { x: 0.1, y: 0.1, width: 0.8, height: 0.8 };
  state.images = [{ ...state.image, kind: 'image', id: 'other', source: 'other.png', width: 100, height: 100 }];
  const primary = screenshotPaintState(state, null, true, 'image');
  expect(primary.image.crop).toBeUndefined();
  expect(primary.images![0]!.crop).toEqual(state.image.crop);
  const secondary = screenshotPaintState(state, null, true, 'other');
  expect(secondary.image).toBe(state.image);
  expect(secondary.images![0]!.crop).toBeUndefined();
  expect(state.image.crop).toBeDefined();
});
it('paints the current zoom draft as manual while preserving the other zooms', () => {
  const state = createStillDocument('x', 'source', 100, 100).state;
  const zooms = [
    { ...createManualZoom('a', 0, 1), mode: 'manual' as const, kind: 'zoom' as const, name: 'A', enabled: true },
    { ...createManualZoom('b', 0, 1), mode: 'manual' as const, kind: 'zoom' as const, name: 'B', enabled: true },
  ];
  state.zooms = zooms;
  const draft = { ...zooms[0]!, depth: 3 as const };
  const output = screenshotPaintState(state, draft, false);
  expect(output.zooms![0]).toMatchObject({ id: 'a', depth: 3, mode: 'manual' });
  expect(output.zooms![1]).toBe(zooms[1]);
  expect(zooms[0]!.depth).toBe(2);
});
