const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const test = require('node:test');

const { createProjectStore } = require('../electron/projects/project-store.cjs');
const { organizeProjectCategories } = require('../electron/storage/project-categories.cjs');

function temporaryRoot(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-project-categories-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function writeProject(directory, projectId, overrides = {}) {
  fs.mkdirSync(directory, { recursive: true });
  const manifest = {
    schemaVersion: 7,
    projectId,
    name: 'Legacy project',
    createdAtUtc: '2025-01-01T00:00:00.000Z',
    updatedAtUtc: '2025-01-02T00:00:00.000Z',
    sessions: [],
    editor: { schemaVersion: 3, composition: { clips: [] } },
    ...overrides,
  };
  fs.writeFileSync(path.join(directory, 'project.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

function projectMediaUrl(root, file) {
  const relative = path.relative(root, file).split(path.sep).join('/');
  return 'project-media://asset/' + encodeURIComponent(relative);
}

test('moves legacy projects into studio and rewrites references in project and nested JSON files', (t) => {
  const root = temporaryRoot(t);
  const legacyDirectory = path.join(root, 'Legacy Project');
  const oldMedia = path.join(legacyDirectory, 'media', 'preview.webp');
  const newDirectory = path.join(root, 'studio', 'Legacy Project');
  const newMedia = path.join(newDirectory, 'media', 'preview.webp');
  const projectId = '11111111-1111-4111-8111-111111111111';
  fs.mkdirSync(path.dirname(oldMedia), { recursive: true });
  fs.writeFileSync(oldMedia, Buffer.from([0, 1, 2, 255]));

  const legacyMediaUrl = projectMediaUrl(root, oldMedia);
  const project = writeProject(legacyDirectory, projectId, {
    name: 'Keep my project name',
    previewSrc: pathToFileURL(oldMedia).href,
    futureSchemaData: { absolutePath: oldMedia, source: legacyMediaUrl },
  });
  const nestedPath = path.join(legacyDirectory, 'sessions', 'session-a', 'editor.json');
  const nested = {
    schemaVersion: 12,
    sources: [oldMedia, pathToFileURL(oldMedia).href, legacyMediaUrl],
  };
  fs.mkdirSync(path.dirname(nestedPath), { recursive: true });
  fs.writeFileSync(nestedPath, `${JSON.stringify(nested, null, 2)}\n`);

  organizeProjectCategories(root);

  const migrated = JSON.parse(fs.readFileSync(path.join(newDirectory, 'project.json'), 'utf8'));
  assert.deepEqual(migrated, {
    ...project,
    previewSrc: pathToFileURL(newMedia).href,
    futureSchemaData: {
      absolutePath: newMedia,
      source: projectMediaUrl(root, newMedia),
    },
  });
  assert.deepEqual(
    JSON.parse(fs.readFileSync(path.join(newDirectory, 'sessions', 'session-a', 'editor.json'), 'utf8')),
    {
      schemaVersion: 12,
      sources: [newMedia, pathToFileURL(newMedia).href, projectMediaUrl(root, newMedia)],
    },
  );
  assert.deepEqual(fs.readFileSync(newMedia), Buffer.from([0, 1, 2, 255]));
  assert.equal(fs.existsSync(legacyDirectory), false);
});

test('uses an unused studio name on collision and leaves categories and unrelated folders intact', (t) => {
  const root = temporaryRoot(t);
  const ids = {
    studio: '22222222-2222-4222-8222-222222222222',
    studioSuffix: '33333333-3333-4333-8333-333333333333',
    legacy: '44444444-4444-4444-8444-444444444444',
  };
  writeProject(path.join(root, 'studio', 'Legacy Project'), ids.studio);
  writeProject(path.join(root, 'studio', 'Legacy Project-2'), ids.studioSuffix);
  const legacy = path.join(root, 'Legacy Project');
  writeProject(legacy, ids.legacy);
  fs.writeFileSync(path.join(legacy, 'data.bin'), 'legacy data');

  for (const category of ['studio', 'instant', 'screenshot']) {
    const marker = path.join(root, category, 'keep.txt');
    fs.mkdirSync(path.dirname(marker), { recursive: true });
    fs.writeFileSync(marker, category);
  }
  const unrelated = path.join(root, 'notes');
  fs.mkdirSync(path.join(unrelated, 'nested-project'), { recursive: true });
  fs.writeFileSync(path.join(unrelated, 'nested-project', 'project.json'), '{}');
  fs.writeFileSync(path.join(unrelated, 'keep.txt'), 'unrelated');

  organizeProjectCategories(root);

  const store = createProjectStore(root, { category: 'studio' });
  assert.deepEqual(new Set(store.list().map((project) => project.id)), new Set(Object.values(ids)));
  const movedLegacy = store.directoryFor(ids.legacy);
  assert.ok(movedLegacy.startsWith(path.join(root, 'studio') + path.sep));
  assert.notEqual(movedLegacy, path.join(root, 'studio', 'Legacy Project'));
  assert.equal(fs.readFileSync(path.join(movedLegacy, 'data.bin'), 'utf8'), 'legacy data');
  assert.equal(fs.readFileSync(path.join(unrelated, 'keep.txt'), 'utf8'), 'unrelated');
  assert.equal(fs.readFileSync(path.join(unrelated, 'nested-project', 'project.json'), 'utf8'), '{}');
  for (const category of ['studio', 'instant', 'screenshot'])
    assert.equal(fs.readFileSync(path.join(root, category, 'keep.txt'), 'utf8'), category);
});

test('does not follow a symlinked legacy project directory', (t) => {
  const root = temporaryRoot(t);
  const external = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-linked-project-'));
  t.after(() => fs.rmSync(external, { recursive: true, force: true }));
  const externalId = '55555555-5555-4555-8555-555555555555';
  writeProject(external, externalId);
  const link = path.join(root, 'linked-project');
  try {
    fs.symlinkSync(external, link, process.platform === 'win32' ? 'junction' : 'dir');
  } catch (error) {
    if (['EACCES', 'EPERM', 'ENOTSUP'].includes(error.code)) {
      t.skip('the current environment does not allow creating directory symlinks');
      return;
    }
    throw error;
  }

  organizeProjectCategories(root);

  assert.equal(fs.lstatSync(link).isSymbolicLink(), true);
  assert.equal(fs.existsSync(path.join(external, 'project.json')), true);
  assert.equal(fs.existsSync(path.join(root, 'studio', 'linked-project')), false);
});

test('organizing categories twice preserves the migrated files and manifest bytes', (t) => {
  const root = temporaryRoot(t);
  const projectId = '66666666-6666-4666-8666-666666666666';
  const legacy = path.join(root, 'Repeatable');
  const original = writeProject(legacy, projectId, { customData: { retained: true } });
  const media = path.join(legacy, 'media', 'asset.bin');
  fs.mkdirSync(path.dirname(media), { recursive: true });
  fs.writeFileSync(media, Buffer.from('preserve these bytes'));

  organizeProjectCategories(root);
  const migrated = path.join(root, 'studio', 'Repeatable');
  const manifestBefore = fs.readFileSync(path.join(migrated, 'project.json'));
  const mediaBefore = fs.readFileSync(path.join(migrated, 'media', 'asset.bin'));
  organizeProjectCategories(root);

  assert.deepEqual(fs.readFileSync(path.join(migrated, 'project.json')), manifestBefore);
  assert.deepEqual(JSON.parse(manifestBefore.toString('utf8')), original);
  assert.deepEqual(fs.readFileSync(path.join(migrated, 'media', 'asset.bin')), mediaBefore);
  assert.deepEqual(fs.readdirSync(path.join(root, 'studio')), ['Repeatable']);
  assert.equal(fs.existsSync(path.join(root, '.category-migration.json')), false);
});

test('studio project stores create in studio and list both studio and instant projects', (t) => {
  const root = temporaryRoot(t);
  organizeProjectCategories(root);
  const studioStore = createProjectStore(root, { category: 'studio' });
  const instantStore = createProjectStore(root, { category: 'instant' });

  const studioProject = studioStore.create({ name: 'Studio project' });
  const instantProject = instantStore.create({ name: 'Instant project' });
  const screenshotId = '77777777-7777-4777-8777-777777777777';
  writeProject(path.join(root, 'screenshot', 'Screenshot project'), screenshotId);

  assert.ok(studioStore.directoryFor(studioProject.id).startsWith(path.join(root, 'studio') + path.sep));
  assert.ok(instantStore.directoryFor(instantProject.id).startsWith(path.join(root, 'instant') + path.sep));
  assert.deepEqual(
    new Set(studioStore.list().map((project) => project.id)),
    new Set([studioProject.id, instantProject.id]),
  );
});
