import { describe, expect, it } from 'vitest';
import { screenshotState, screenshotShape } from '../screenshot-state';
import { initializeScreenshotComposition } from '@beam/engine/screenshot/screenshot-layers';
import { duplicateScreenshotSelection } from '../duplicate-screenshot-selection';
import {
  screenshotDragDelta,
  constrainedScreenshotTranslation,
  resizedScreenshotTransform,
} from '../screenshot-drag-geometry';
import { documentFixture } from './screenshot-editor-test-helpers';
import { hydrateActionBindings } from '~/shortcuts/action-bindings';
import { afterEach } from 'vitest';
const source = { source: 'project-media://screenshot/source.png', width: 1200, height: 800 };
const fixture = () => {
  const state = screenshotState(documentFixture());
  state.shapes = [screenshotShape('rectangle', 'shape')];
  initializeScreenshotComposition(state);
  return state;
};
afterEach(() => hydrateActionBindings({}));
describe('duplicate selected Screenshot layers', () => {
  it('duplicates at the dragged position and keeps originals unchanged', () => {
    const state = fixture(),
      before = structuredClone(state.shapes[0]);
    const result = duplicateScreenshotSelection(state, source, ['shape'], 'shape', { x: 0.2, y: 0.1 }, () => 'copy')!;
    expect(result.ids).toEqual(['copy']);
    expect(state.shapes[0]).toEqual(before);
    expect(state.shapes[1]!.transform.x).toBeCloseTo(before!.transform.x + 0.2);
    expect(state.shapes[1]!.transform.y).toBeCloseTo(before!.transform.y + 0.1);
  });
  it('uses the ordinary paste offset for keyboard duplication and copies the real captured source', () => {
    const state = fixture();
    duplicateScreenshotSelection(state, source, [state.image.id], state.image.id, undefined, () => 'image-copy');
    expect(state.images?.[0]?.source).toBe(source.source);
    expect(state.images?.[0]?.transform.x).toBeGreaterThan(state.image.transform.x);
  });
  it('ignores locked and unavailable selections', () => {
    const state = fixture();
    state.composition!.find((layer) => layer.id === 'shape')!.locked = true;
    const before = structuredClone(state);
    for (const ids of [[], ['missing'], ['shape']])
      expect(duplicateScreenshotSelection(state, source, ids, ids[0] ?? null)).toBeNull();
    expect(state).toEqual(before);
  });
  it('keeps a mixed selection and its primary ID in the pasted result', () => {
    const state = fixture();
    let id = 0;
    const result = duplicateScreenshotSelection(
      state,
      source,
      [state.image.id, 'shape'],
      'shape',
      { x: 0, y: 0 },
      () => `copy-${++id}`,
    )!;
    expect(result.ids).toHaveLength(2);
    expect(result.primaryId).toBe(result.ids[1]);
    expect(state.shapes).toHaveLength(2);
  });
  it('rejects identity collisions without modifying the saved layers', () => {
    const state = fixture(),
      before = structuredClone(state);
    expect(() => duplicateScreenshotSelection(state, source, ['shape'], 'shape', undefined, () => 'shape')).toThrow();
    expect(state).toEqual(before);
  });
});
describe('Screenshot drag geometry with custom modifiers', () => {
  const drag = { x: 10, y: 10, width: 1000, height: 100, initial: { x: 0, y: 0, width: 0.5, height: 0.5 } };
  it('chooses the straight line in screen pixels, not normalized aspect ratio', () => {
    expect(screenshotDragDelta(drag, { clientX: 50, clientY: 20, shiftKey: true })).toEqual({ x: 0.04, y: 0 });
    expect(screenshotDragDelta(drag, { clientX: 15, clientY: 30, shiftKey: true })).toEqual({ x: 0, y: 0.2 });
    expect(screenshotDragDelta(drag, { clientX: 50, clientY: 20 })).toEqual({ x: 0.04, y: 0.1 });
  });
  it('preserves a locked drag axis after snapping while leaving unconstrained drags alone', () => {
    expect(constrainedScreenshotTranslation({ x: 0, y: 0.2 }, { x: 0.01, y: 0.21 }, { shiftKey: true })).toEqual({
      x: 0,
      y: 0.21,
    });
    expect(constrainedScreenshotTranslation({ x: 0.2, y: 0 }, { x: 0.21, y: 0.01 }, { shiftKey: true })).toEqual({
      x: 0.21,
      y: 0,
    });
    expect(constrainedScreenshotTranslation({ x: 0.2, y: 0 }, { x: 0.21, y: 0.01 }, {})).toEqual({ x: 0.21, y: 0.01 });
  });
  it('resizes images proportionally by default and uses the custom free-aspect modifier', () => {
    const resize = { ...drag, corner: 'bottom-right' as const };
    expect(screenshotDragDelta(resize, { clientX: 50, clientY: 20, shiftKey: true })).toEqual({ x: 0.04, y: 0.1 });
    const proportional = resizedScreenshotTransform(resize, 0.1, 0.02, {}, drag.initial);
    const free = resizedScreenshotTransform(resize, 0.1, 0.02, { shiftKey: true }, drag.initial);
    expect(proportional.width / proportional.height).toBeCloseTo(1);
    expect(free.width / free.height).not.toBeCloseTo(1);
    hydrateActionBindings({ 'gesture.freeAspect': { keys: 'Control', scope: 'application', category: 'gestures' } });
    expect(resizedScreenshotTransform(resize, 0.1, 0.02, { ctrlKey: true }, drag.initial)).toEqual(free);
    expect(resizedScreenshotTransform(resize, 0.1, 0.02, { shiftKey: true }, drag.initial)).toEqual(proportional);
  });
});
