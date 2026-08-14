const assert = require('node:assert/strict');
const test = require('node:test');

const { shouldAutoOpenDevTools } = require('../electron/window/devtools-policy.cjs');

test('does not auto-open DevTools in development without opt-in', () => {
  assert.equal(shouldAutoOpenDevTools({ isPackaged: false, environment: {} }), false);
});

test('auto-opens DevTools in development with explicit opt-in', () => {
  assert.equal(
    shouldAutoOpenDevTools({
      isPackaged: false,
      environment: { BEAM_DEVTOOLS: '1' },
    }),
    true,
  );
});

test('never auto-opens DevTools in packaged builds', () => {
  assert.equal(
    shouldAutoOpenDevTools({
      isPackaged: true,
      environment: { BEAM_DEVTOOLS: '1' },
    }),
    false,
  );
});
