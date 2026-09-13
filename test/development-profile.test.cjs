const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const { configureDevelopmentProfile } = require('../electron/lifecycle/development-profile.cjs');

function fakeApp() {
  const calls = [];
  return {
    calls,
    getPath: (name) => {
      assert.equal(name, 'appData');
      return '/config';
    },
    setName: (name) => calls.push(['name', name]),
    setPath: (name, value) => calls.push(['path', name, value]),
  };
}

test('development profile uses an isolated app name and userData directory', () => {
  const app = fakeApp();

  assert.equal(configureDevelopmentProfile(app, { BEAM_DEVELOPMENT_INSTANCE: '1' }), true);
  assert.deepEqual(app.calls, [
    ['name', 'beam-development'],
    ['path', 'userData', path.join('/config', 'Beam Development')],
  ]);
});

test('production profile remains untouched without the development marker', () => {
  const app = fakeApp();

  assert.equal(configureDevelopmentProfile(app, {}), false);
  assert.deepEqual(app.calls, []);
});
