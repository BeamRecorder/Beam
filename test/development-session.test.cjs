const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const {
  developmentSessionId,
  developmentOrigin,
  developmentRendererUrl,
} = require('../apps/desktop/electron/lifecycle/development-session.cjs');

test('session identity is stable across restarts and normalized paths', () => {
  assert.equal(developmentSessionId('/beam/one'), developmentSessionId('/beam/one', 'default'));
  assert.equal(developmentSessionId('/beam/one'), developmentSessionId(path.join('/beam/one', '..', 'one')));
  assert.match(developmentSessionId('/beam/one', 'test_a-2'), /^[0-9a-f]{16}-test_a-2$/);
});

test('worktrees with identical names and named sessions remain independent', () => {
  assert.notEqual(developmentSessionId('/beam/one'), developmentSessionId('/other/one'));
  assert.notEqual(developmentSessionId('/beam/one', 'a'), developmentSessionId('/beam/one', 'b'));
  assert.notEqual(developmentSessionId('/beam/one', 'a'), developmentSessionId('/beam/two', 'a'));
});

test('session names cannot escape profile directories or create invalid D-Bus names', () => {
  for (const name of ['', '../one', 'a/b', 'a\\b', '.', 'a b', 'A', 'é', '-a', 'a'.repeat(41)]) {
    assert.throws(() => developmentSessionId('/beam', name), /Development session/);
  }
  assert.doesNotThrow(() => developmentSessionId('/beam', 'a'.repeat(40)));
});

test('development origin keeps the manual port and supports allocated loopback ports', () => {
  assert.equal(developmentOrigin({}), 'http://localhost:6500');
  assert.equal(developmentOrigin({ BEAM_DEV_SERVER_URL: 'http://localhost:6502/' }), 'http://localhost:6502');
  assert.equal(developmentOrigin({ BEAM_DEV_SERVER_URL: 'http://127.0.0.1:12345' }), 'http://127.0.0.1:12345');
});

test('development origins reject remote, credentialed and non-origin URLs', () => {
  for (const url of [
    '',
    'invalid',
    'https://localhost:6500',
    'http://example.com:6500',
    'http://localhost.example.com:6500',
    'http://user:password@localhost:6500',
    'http://localhost:6500/html/index.html',
    'http://localhost:6500?session=one',
    'http://localhost:6500#one',
  ]) {
    assert.throws(() => developmentOrigin({ BEAM_DEV_SERVER_URL: url }));
  }
});

test('renderer URLs retain the selected port for pages and query arguments', () => {
  assert.equal(developmentRendererUrl('editor.html', {}), 'http://localhost:6500/html/editor.html');
  const env = { BEAM_DEV_SERVER_URL: 'http://localhost:6503' };
  assert.equal(
    developmentRendererUrl('hud-panel.html?panel=settings', env),
    'http://localhost:6503/html/hud-panel.html?panel=settings',
  );
  assert.equal(
    developmentRendererUrl('index.html?quickSnipCrop=1', env),
    'http://localhost:6503/html/index.html?quickSnipCrop=1',
  );
});
