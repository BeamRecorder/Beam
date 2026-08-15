const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createUpdateCache, updaterCacheDirectory } = require('../electron/updates/update-cache.cjs');

function temporaryUpdateCache() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-update-cache-'));
  const cacheDirectory = path.join(root, 'beam-updater');
  const stateFile = path.join(root, 'user-data', 'update-cache-state.json');
  return {
    root,
    cacheDirectory,
    stateFile,
    cache: createUpdateCache({ stateFile, cacheDirectory }),
  };
}

function writeState(stateFile, state) {
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  fs.writeFileSync(stateFile, `${JSON.stringify(state)}\n`);
}

function writeCacheArtifact(cacheDirectory, relativePath = 'update.zip') {
  const artifact = path.join(cacheDirectory, relativePath);
  fs.mkdirSync(path.dirname(artifact), { recursive: true });
  fs.writeFileSync(artifact, 'cached update');
}

function readState(stateFile) {
  return JSON.parse(fs.readFileSync(stateFile, 'utf8'));
}

test('resolves Windows, macOS, Linux XDG, and Linux fallback updater cache paths', () => {
  assert.equal(
    updaterCacheDirectory({
      platform: 'win32',
      environment: { LOCALAPPDATA: '/tmp/local-app-data' },
      homeDirectory: '/home/tester',
    }),
    path.join('/tmp/local-app-data', 'beam-updater'),
  );
  assert.equal(
    updaterCacheDirectory({ platform: 'darwin', environment: {}, homeDirectory: '/Users/tester' }),
    path.join('/Users/tester', 'Library', 'Caches', 'beam-updater'),
  );
  assert.equal(
    updaterCacheDirectory({
      platform: 'linux',
      environment: { XDG_CACHE_HOME: '/tmp/xdg-cache' },
      homeDirectory: '/home/tester',
    }),
    path.join('/tmp/xdg-cache', 'beam-updater'),
  );
  assert.equal(
    updaterCacheDirectory({ platform: 'linux', environment: {}, homeDirectory: '/home/tester' }),
    path.join('/home/tester', '.cache', 'beam-updater'),
  );
});

test('cleans a legacy cache on first launch and writes current state', () => {
  const fixture = temporaryUpdateCache();
  try {
    writeCacheArtifact(fixture.cacheDirectory, 'legacy/update.zip');

    assert.equal(fixture.cache.cleanupForVersion('1.2.3'), true);
    assert.equal(fs.existsSync(fixture.cacheDirectory), false);
    assert.deepEqual(readState(fixture.stateFile), {
      schemaVersion: 1,
      lastSeenVersion: '1.2.3',
      pendingVersion: null,
    });
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('preserves the cache when the current version has a newer pending update', () => {
  const fixture = temporaryUpdateCache();
  try {
    writeState(fixture.stateFile, { schemaVersion: 1, lastSeenVersion: '1.2.3', pendingVersion: '1.3.0' });
    writeCacheArtifact(fixture.cacheDirectory, 'pending/differential-update.blockmap');

    assert.equal(fixture.cache.cleanupForVersion('1.2.3'), false);
    assert.equal(fs.existsSync(path.join(fixture.cacheDirectory, 'pending/differential-update.blockmap')), true);
    assert.deepEqual(readState(fixture.stateFile), {
      schemaVersion: 1,
      lastSeenVersion: '1.2.3',
      pendingVersion: '1.3.0',
    });
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('removes cache artifacts when no update is awaiting installation', () => {
  const fixture = temporaryUpdateCache();
  try {
    writeState(fixture.stateFile, { schemaVersion: 1, lastSeenVersion: '1.2.3', pendingVersion: null });
    writeCacheArtifact(fixture.cacheDirectory, 'installer.exe');

    assert.equal(fixture.cache.cleanupForVersion('1.2.3'), true);
    assert.equal(fs.existsSync(fixture.cacheDirectory), false);
    assert.deepEqual(readState(fixture.stateFile), {
      schemaVersion: 1,
      lastSeenVersion: '1.2.3',
      pendingVersion: null,
    });
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('removes the entire updater cache on version change and clears pending state', () => {
  const fixture = temporaryUpdateCache();
  try {
    writeState(fixture.stateFile, { schemaVersion: 1, lastSeenVersion: '1.2.3', pendingVersion: '1.3.0' });
    writeCacheArtifact(fixture.cacheDirectory, 'download/update.zip');
    writeCacheArtifact(fixture.cacheDirectory, 'download/update.zip.blockmap');
    writeCacheArtifact(fixture.cacheDirectory, 'differential/patch.bin');

    assert.equal(fixture.cache.cleanupForVersion('2.0.0'), true);
    assert.equal(fs.existsSync(fixture.cacheDirectory), false);
    assert.deepEqual(readState(fixture.stateFile), {
      schemaVersion: 1,
      lastSeenVersion: '2.0.0',
      pendingVersion: null,
    });
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('cleans the cache after a pending update has become the current version', () => {
  const fixture = temporaryUpdateCache();
  try {
    writeState(fixture.stateFile, { schemaVersion: 1, lastSeenVersion: '1.2.3', pendingVersion: '1.2.3' });
    writeCacheArtifact(fixture.cacheDirectory, 'installed/update.zip');

    assert.equal(fixture.cache.cleanupForVersion('1.2.3'), true);
    assert.equal(fs.existsSync(fixture.cacheDirectory), false);
    assert.deepEqual(readState(fixture.stateFile), {
      schemaVersion: 1,
      lastSeenVersion: '1.2.3',
      pendingVersion: null,
    });
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('migrates corrupted state by cleaning the cache and writing fresh state', () => {
  const fixture = temporaryUpdateCache();
  try {
    fs.mkdirSync(path.dirname(fixture.stateFile), { recursive: true });
    fs.writeFileSync(fixture.stateFile, '{not valid json');
    writeCacheArtifact(fixture.cacheDirectory, 'corrupted/update.zip');

    assert.equal(fixture.cache.cleanupForVersion('1.2.3'), true);
    assert.equal(fs.existsSync(fixture.cacheDirectory), false);
    assert.deepEqual(readState(fixture.stateFile), {
      schemaVersion: 1,
      lastSeenVersion: '1.2.3',
      pendingVersion: null,
    });
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});
