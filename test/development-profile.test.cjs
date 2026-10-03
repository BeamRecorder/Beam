const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const { configureDevelopmentProfile } = require('../apps/desktop/electron/lifecycle/development-profile.cjs');
const { developmentSessionId } = require('../apps/desktop/electron/lifecycle/development-session.cjs');

function fakeApp() {
  const calls = [];
  return {
    calls,
    getAppPath: () => '/workspace/beam',
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
  const id = developmentSessionId('/workspace/beam');
  const directory = path.join('/config', 'Beam Development', id);

  assert.equal(
    configureDevelopmentProfile(
      app,
      { BEAM_DEVELOPMENT_INSTANCE: '1' },
      {
        mkdirSync: (...args) => app.calls.push(['mkdir', ...args]),
      },
    ),
    true,
  );
  assert.deepEqual(app.calls, [
    ['mkdir', directory, { recursive: true }],
    ['name', `beam-development-${id}`],
    ['path', 'userData', directory],
    ['path', 'sessionData', directory],
  ]);
});

test('different worktrees and session names select different persistent profiles', () => {
  const profiles = [
    ['/workspace/one', 'default'],
    ['/workspace/two', 'default'],
    ['/workspace/one', 'second'],
  ].map(([applicationRoot, session]) => {
    const app = fakeApp();
    configureDevelopmentProfile(
      app,
      { BEAM_DEVELOPMENT_INSTANCE: '1', BEAM_DEV_SESSION: session },
      { applicationRoot, mkdirSync: () => {} },
    );
    return app.calls;
  });
  assert.equal(new Set(profiles.map((calls) => calls.find((call) => call[1] === 'userData')[2])).size, 3);
  assert.equal(new Set(profiles.map((calls) => calls[0][1])).size, 3);
});

test('packaged applications ignore development environment variables', () => {
  const app = { ...fakeApp(), isPackaged: true };
  assert.equal(
    configureDevelopmentProfile(app, { BEAM_DEVELOPMENT_INSTANCE: '1', BEAM_DEV_SESSION: '../invalid' }),
    false,
  );
  assert.deepEqual(app.calls, []);
});

test('invalid names and directory creation failures do not partially configure Electron', () => {
  const app = fakeApp();
  assert.throws(
    () => configureDevelopmentProfile(app, { BEAM_DEVELOPMENT_INSTANCE: '1', BEAM_DEV_SESSION: '../bad' }),
    /Development session/,
  );
  assert.throws(
    () =>
      configureDevelopmentProfile(
        app,
        { BEAM_DEVELOPMENT_INSTANCE: '1' },
        {
          mkdirSync: () => {
            throw new Error('disk unavailable');
          },
        },
      ),
    /disk unavailable/,
  );
  assert.deepEqual(app.calls, []);
});

test('production profile remains untouched without the development marker', () => {
  const app = fakeApp();

  assert.equal(configureDevelopmentProfile(app, {}), false);
  assert.deepEqual(app.calls, []);
});
