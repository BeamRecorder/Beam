const assert = require('node:assert/strict');
const test = require('node:test');
const { CURSOR_PACK_DISCOVERY_URL } = require('../electron/projects/project-ipc.cjs');

test('cursor pack discovery opens the fixed KDE cursor-theme catalog', () => {
  assert.equal(CURSOR_PACK_DISCOVERY_URL, 'https://store.kde.org/browse/cat/107/');
  assert.equal(new URL(CURSOR_PACK_DISCOVERY_URL).hostname, 'store.kde.org');
});
