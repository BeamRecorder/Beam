import { expect, it } from 'vitest';
import { createElementText } from '@beam/engine/shared/element-text';
import { screenshotState, screenshotShape } from '../screenshot-state';
import {
  renameScreenshotLayer,
  removeScreenshotLayer,
  screenshotLayers,
  updateScreenshotLayer,
} from '@beam/engine/screenshot/screenshot-layers';
import { documentFixture } from './screenshot-editor-test-helpers';

it('renames image, shape, background and watermark layers without changing rendered content', () => {
  const state = screenshotState(documentFixture());
  state.shapes = [{ ...screenshotShape('text', 'text'), text: createElementText('Rendered text') }];
  for (const id of [state.image.id, 'text', '__background__', '__watermark__']) {
    expect(renameScreenshotLayer(state, id, `  Name ${id}  `)).toBe(true);
    expect(screenshotLayers(state).find((layer) => layer.id === id)?.name).toBe(`Name ${id}`);
  }
  expect(state.shapes[0]!.text?.content).toBe('Rendered text');
  expect(state.image.name).toBe('Captured screen');
});
it('rejects blank, unchanged, missing and locked layer names without adding metadata', () => {
  const state = screenshotState(documentFixture());
  for (const [id, name] of [
    [state.image.id, ' '],
    [state.image.id, 'Captured screen'],
    [state.image.id, 'x'.repeat(201)],
    ['missing', 'Name'],
  ])
    expect(renameScreenshotLayer(state, id!, name!)).toBe(false);
  updateScreenshotLayer(state, state.image.id, { locked: true });
  expect(renameScreenshotLayer(state, state.image.id, 'Blocked')).toBe(false);
  expect(state.layerNames).toBeUndefined();
});
it('treats prototype-like IDs as ordinary layer references rather than inherited aliases', () => {
  const state = screenshotState(documentFixture());
  state.shapes = [screenshotShape('rectangle', 'constructor'), screenshotShape('rectangle', '__proto__')];
  state.layerNames = {};
  expect(screenshotLayers(state).find((layer) => layer.id === 'constructor')?.name).toBe('rectangle');
  for (const id of ['constructor', '__proto__']) {
    expect(renameScreenshotLayer(state, id, 'Annotation')).toBe(true);
    expect(screenshotLayers(state).find((layer) => layer.id === id)?.name).toBe('Annotation');
  }
});
it('round-trips saved names and removes the metadata only for the deleted layer', () => {
  const state = screenshotState(documentFixture());
  renameScreenshotLayer(state, state.image.id, 'Screenshot alias');
  renameScreenshotLayer(state, '__background__', 'Backdrop');
  const restored = screenshotState({ ...documentFixture(), state });
  expect(screenshotLayers(restored).find((layer) => layer.id === restored.image.id)?.name).toBe('Screenshot alias');
  removeScreenshotLayer(restored, restored.image.id);
  expect(restored.layerNames).toEqual({ __background__: 'Backdrop' });
  expect(state.layerNames?.[state.image.id]).toBe('Screenshot alias');
});
