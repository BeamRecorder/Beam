const assert = require('node:assert/strict');
const test = require('node:test');
const { historicalAppearance } = require('../electron/projects/composition-appearance.cjs');
const { validateScreenshotHistory } = require('../electron/screenshot/screenshot-history.cjs');

const clone = (value) => JSON.parse(JSON.stringify(value));
const validState = (patch = {}) => {
  const state = {
    format: 'png',
    quality: 0.95,
    blurPercent: 30,
    background: null,
    shapes: [],
    image: {
      id: 'screenshot',
      kind: 'image',
      enabled: true,
      transform: { x: 0.06, y: 0.06, width: 0.88, height: 0.88 },
      appearance: historicalAppearance('screen', true),
    },
    canvas: { width: 1280, height: 720, showBackground: true },
  };
  return {
    ...state,
    ...patch,
    image: patch.image === undefined ? state.image : { ...state.image, ...patch.image },
    canvas: patch.canvas === undefined ? state.canvas : { ...state.canvas, ...patch.canvas },
  };
};
const historyFor = (state) => ({ version: 1, undo: [clone(state)], redo: [] });

test('accepts an omitted history and a valid bounded undo/redo snapshot', () => {
  const state = validState();
  assert.doesNotThrow(() => validateScreenshotHistory(undefined, state));

  const history = {
    version: 1,
    undo: [validState({ quality: 0.8 }), clone(state)],
    redo: [validState({ quality: 0.7 })],
  };
  assert.doesNotThrow(() => validateScreenshotHistory(history, state));
});

test('requires version one, arrays, a nonempty undo stack and the current state at its end', () => {
  const state = validState();
  for (const history of [
    null,
    { version: 2, undo: [clone(state)], redo: [] },
    { version: 1, undo: [], redo: [] },
    { version: 1, undo: {}, redo: [] },
    { version: 1, undo: [clone(state)], redo: null },
    historyFor(validState({ quality: 0.8 })),
  ]) {
    assert.throws(() => validateScreenshotHistory(history, state));
  }
});

test('accepts exactly fifty entries across both stacks and rejects a larger history', () => {
  const state = validState();
  const atLimit = {
    version: 1,
    undo: [...Array.from({ length: 24 }, () => validState()), clone(state)],
    redo: Array.from({ length: 25 }, () => validState()),
  };
  assert.doesNotThrow(() => validateScreenshotHistory(atLimit, state));

  const tooLarge = { ...atLimit, redo: [...atLimit.redo, validState()] };
  assert.throws(() => validateScreenshotHistory(tooLarge, state));
});

test('validates every historical state in both stacks', () => {
  const state = validState();
  const invalidState = validState({ format: 'jpeg' });

  assert.throws(() =>
    validateScreenshotHistory(
      {
        version: 1,
        undo: [invalidState],
        redo: [],
      },
      state,
    ),
  );
  assert.throws(() =>
    validateScreenshotHistory(
      {
        version: 1,
        undo: [clone(state)],
        redo: [invalidState],
      },
      state,
    ),
  );
});
