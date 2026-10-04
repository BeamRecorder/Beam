const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { configureDevelopmentProfile } = require('../apps/desktop/electron/lifecycle/development-profile.cjs');
const { createUserPaths } = require('../apps/desktop/electron/storage/user-paths.cjs');
const { createProjectStore } = require('../apps/desktop/electron/projects/project-store.cjs');
const { createScreenshotStore } = require('../apps/desktop/electron/screenshot/screenshot-store.cjs');
const { createProjectLibrary } = require('../apps/desktop/electron/projects/project-library.cjs');

function fakeApp(root) {
  const paths = new Map([
    ['appData', path.join(root, 'config')],
    ['userData', path.join(root, 'config', 'Beam')],
    ['sessionData', path.join(root, 'config', 'Beam')],
    ['videos', path.join(root, 'Vidéos')],
  ]);
  return {
    getPath(name) {
      assert.ok(paths.has(name), `Unexpected Electron path: ${name}`);
      return paths.get(name);
    },
    setPath: (name, value) => paths.set(name, value),
    setName: () => {},
  };
}

const sessions = [
  ['/workspace/first', 'default'],
  ['/workspace/second', 'default'],
  ['/workspace/first', 'preview'],
];

test('resolves immutable user paths from the OS Videos directory', () => {
  const app = fakeApp('/user');
  const user = path.join('/user', 'Vidéos', 'Beam', 'user');
  const paths = createUserPaths(app);
  assert.deepEqual(paths, {
    user,
    preferences: path.join(user, 'preferences.json'),
    editorPresets: path.join(user, 'editor-presets.json'),
    screenshotPresets: path.join(user, 'screenshot-presets.json'),
    screenshots: path.join(user, 'projects', 'screenshot'),
    studioProjects: path.join(user, 'projects', 'studio'),
    instantProjects: path.join(user, 'projects', 'instant'),
    projects: path.join(user, 'projects'),
    wallpapers: path.join(user, 'media', 'wallpapers'),
    wallpaperImages: path.join(user, 'media', 'wallpapers', 'image'),
    wallpaperVideos: path.join(user, 'media', 'wallpapers', 'video'),
    fonts: path.join(user, 'media', 'fonts'),
    cursors: path.join(user, 'media', 'cursors'),
    whisperModels: path.join(user, 'models', 'whisper'),
  });
  assert.ok(Object.isFrozen(paths));
});

test('worktrees and named sessions isolate Chromium without changing application user paths', () => {
  const normalPaths = createUserPaths(fakeApp('/user'));
  const profiles = sessions.map(([applicationRoot, session]) => {
    const app = fakeApp('/user');
    configureDevelopmentProfile(
      app,
      { BEAM_DEVELOPMENT_INSTANCE: '1', BEAM_DEV_SESSION: session },
      { applicationRoot, mkdirSync: () => {} },
    );
    assert.deepEqual(createUserPaths(app), normalPaths);
    assert.equal(app.getPath('sessionData'), app.getPath('userData'));
    assert.notEqual(app.getPath('userData'), normalPaths.user);
    return app.getPath('userData');
  });
  assert.equal(new Set(profiles).size, sessions.length);
});

test('every development session can list existing Studio, Instant and screenshot projects', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-user-paths-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const normalPaths = createUserPaths(fakeApp(root));
  const studio = createProjectStore(normalPaths.projects, { category: 'studio' }).create({ name: 'Studio' });
  const instant = createProjectStore(normalPaths.projects, { category: 'instant' }).create({ name: 'Instant' });
  const screenshots = createScreenshotStore(normalPaths.screenshots);
  const pending = screenshots.create();
  fs.writeFileSync(pending.path, 'existing screenshot');
  const screenshot = screenshots.complete(pending.id, { width: 1280, height: 720 }, {});
  const expected = new Map([
    [studio.id, 'studio'],
    [instant.id, 'instant'],
    [screenshot.id, 'screenshot'],
  ]);

  for (const [applicationRoot, session] of sessions) {
    const app = fakeApp(root);
    configureDevelopmentProfile(
      app,
      { BEAM_DEVELOPMENT_INSTANCE: '1', BEAM_DEV_SESSION: session },
      { applicationRoot },
    );
    const userPaths = createUserPaths(app);
    const library = createProjectLibrary(
      createProjectStore(userPaths.projects, { category: 'studio' }),
      createScreenshotStore(userPaths.screenshots),
    );
    assert.deepEqual(new Map(library.list().map(({ id, mode }) => [id, mode])), expected);
    assert.equal(fs.existsSync(path.join(app.getPath('userData'), 'Beam')), false);
  }
  assert.equal(fs.readFileSync(pending.path, 'utf8'), 'existing screenshot');
});

test('resolving user paths does not create or migrate any data', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-user-paths-empty-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const paths = createUserPaths(fakeApp(root));
  assert.equal(fs.existsSync(paths.user), false);
  assert.deepEqual(fs.readdirSync(root), []);
});
