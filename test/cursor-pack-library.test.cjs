const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createCursorPackLibrary } = require('../electron/cursors/cursor-pack-library.cjs');

const STATIC_METADATA = [{ filename: 'cursor.svg', nominal_size: 32, hotspot_x: 1, hotspot_y: 2 }];

const svg = (fill = 'currentColor') =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="16"><path fill="${fill}" d="M0 0h8v8H0z"/></svg>`;

function fixture(t, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-cursor-pack-'));
  const theme = path.join(root, options.themeName || 'theme');
  const scalable = path.join(theme, 'cursors_scalable');
  const libraryRoot = path.join(root, 'library');
  fs.mkdirSync(scalable, { recursive: true });
  if (options.name !== null)
    fs.writeFileSync(path.join(theme, 'index.theme'), `Name=${options.name || 'Test Theme'}\n`);

  for (const [role, value = {}] of Object.entries(options.roles || { default: {} })) {
    const roleDirectory = path.join(scalable, role);
    fs.mkdirSync(roleDirectory, { recursive: true });
    const metadata = value.metadata || STATIC_METADATA;
    fs.writeFileSync(path.join(roleDirectory, 'metadata.json'), JSON.stringify(metadata));
    if (value.svg !== null) fs.writeFileSync(path.join(roleDirectory, 'cursor.svg'), value.svg || svg(value.fill));
    if (value.extraFiles) {
      for (const [name, contents] of Object.entries(value.extraFiles))
        fs.writeFileSync(path.join(roleDirectory, name), contents);
    }
  }

  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, theme, scalable, libraryRoot, library: createCursorPackLibrary(libraryRoot) };
}

function importableRoles(overrides = {}) {
  return { default: {}, ...overrides };
}

test('imports a theme directory and serves its canonical SVG descriptors', () => {
  const item = fixture(test, { roles: importableRoles({ left_ptr: {} }) });
  const result = item.library.importDirectory(item.theme);

  assert.equal(result.duplicate, false);
  assert.equal(result.pack.name, 'Test Theme');
  assert.equal(result.pack.source, 'imported');
  assert.equal(result.pack.colorMode, 'tintable');
  assert.equal(result.pack.defaultCursorId, 'default');
  assert.equal(result.importedCount, 2);
  assert.deepEqual(result.ignoredAnimatedRoles, []);
  assert.match(result.pack.id, /^[a-f0-9]{64}$/);
  assert.equal(item.library.list().length, 1);

  const asset = result.pack.cursors.find((cursor) => cursor.id === 'default');
  assert.ok(asset);
  assert.equal(asset.intrinsicSize.width, 32);
  assert.equal(asset.intrinsicSize.height, 16);
  assert.deepEqual(asset.hotspot, { x: 1, y: 2 });
  assert.match(asset.url, new RegExp(`^project-media://cursor/${result.pack.id}/`));
  const storedFile = item.library.fileForUrl(asset.url);
  assert.ok(storedFile);
  assert.match(fs.readFileSync(storedFile, 'utf8'), /viewBox="0 0 32 16"/);
});

test('accepts a direct cursors_scalable directory and falls back to its folder name', () => {
  const item = fixture(test, { name: null, themeName: 'Fallback Theme', roles: importableRoles() });
  const result = item.library.importDirectory(item.scalable);

  assert.equal(result.pack.name, 'Fallback Theme');
});

test('deduplicates identical imports and persists descriptors across library instances', () => {
  const item = fixture(test, { roles: importableRoles({ arrow: { fill: '#ffffff' } }) });
  const first = item.library.importDirectory(item.theme);
  const duplicate = item.library.importDirectory(item.scalable);
  const reopened = createCursorPackLibrary(item.libraryRoot);

  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.pack.id, first.pack.id);
  assert.equal(duplicate.importedCount, first.importedCount);
  assert.deepEqual(reopened.list(), [first.pack]);
});

test('ignores animated roles while retaining static roles', () => {
  const item = fixture(test, {
    roles: importableRoles({
      busy: {
        metadata: [
          { filename: 'first.svg', nominal_size: 32, hotspot_x: 0, hotspot_y: 0 },
          { filename: 'second.svg', nominal_size: 32, hotspot_x: 0, hotspot_y: 0 },
        ],
      },
    }),
  });
  const result = item.library.importDirectory(item.theme);

  assert.deepEqual(result.ignoredAnimatedRoles, ['busy']);
  assert.equal(result.importedCount, 1);
  assert.deepEqual(
    result.pack.cursors.map((cursor) => cursor.id),
    ['default'],
  );
});

test('marks a pack with fixed colors as original instead of tintable', () => {
  const item = fixture(test, { roles: importableRoles({ left_ptr: { fill: '#123456' } }) });
  const result = item.library.importDirectory(item.theme);

  assert.equal(result.pack.colorMode, 'original');
});

test('marks black and white cursor artwork as tintable', (t) => {
  const item = fixture(t, {
    roles: { default: { svg: '<svg viewBox="0 0 32 32"><path fill="#fff"/><path fill="#000"/></svg>' } },
  });
  const result = item.library.importDirectory(item.theme);

  assert.equal(result.pack.colorMode, 'tintable');
});

test('rejects packs without a static default role', () => {
  const item = fixture(test, { roles: { busy: { metadata: [{ delay: 50 }] } } });

  assert.throws(() => item.library.importDirectory(item.theme), /curseur statique|default|left_ptr|arrow/i);
  assert.deepEqual(item.library.list(), []);
});

test('rejects non-SVG metadata references and traversal', (t) => {
  const cases = [
    { name: 'non-svg', metadata: [{ filename: 'cursor.png', nominal_size: 32, hotspot_x: 0, hotspot_y: 0 }] },
    { name: 'traversal', metadata: [{ filename: '../outside.svg', nominal_size: 32, hotspot_x: 0, hotspot_y: 0 }] },
  ];

  for (const current of cases) {
    const item = fixture(t, { roles: { default: { metadata: current.metadata } } });
    assert.throws(() => item.library.importDirectory(item.theme), /SVG|référence|chemin|pack/i, current.name);
  }
});

test('rejects external symlinked roles', (t) => {
  const item = fixture(t, { roles: { default: {} } });
  const external = path.join(item.root, 'external-role');
  fs.mkdirSync(external, { recursive: true });
  fs.writeFileSync(path.join(external, 'metadata.json'), JSON.stringify(STATIC_METADATA));
  fs.writeFileSync(path.join(external, 'cursor.svg'), svg());
  try {
    fs.symlinkSync(external, path.join(item.scalable, 'left_ptr'), 'junction');
  } catch {
    t.skip('Creating symlinks is unavailable on this host.');
    return;
  }

  assert.throws(() => item.library.importDirectory(item.theme), /symlink|lien|externe/i);
});

test('rejects dangerous or malformed SVG documents', (t) => {
  const cases = [
    ['doctype', '<!DOCTYPE svg><svg xmlns="http://www.w3.org/2000/svg"/>'],
    ['entity', '<!ENTITY xxe "bad"><svg xmlns="http://www.w3.org/2000/svg"/>'],
    ['script', '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'],
    ['event', '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'],
    ['external href', '<svg xmlns="http://www.w3.org/2000/svg"><use href="https://example.com/x"/></svg>'],
    ['external css', '<svg xmlns="http://www.w3.org/2000/svg" style="fill:url(https://example.com/x)"/>'],
    ['malformed', '<svg xmlns="http://www.w3.org/2000/svg"><path></svg>'],
  ];

  for (const [name, content] of cases) {
    const item = fixture(t, { roles: { default: { svg: content } } });
    assert.throws(
      () => item.library.importDirectory(item.theme),
      /interdit|interdite|invalide|ressource|DOCTYPE|entités/i,
      name,
    );
  }
});

test('rejects invalid dimensions and hotspots', (t) => {
  const cases = [
    { name: 'negative viewBox', svg: '<svg viewBox="0 0 -1 16"/>', metadata: STATIC_METADATA },
    { name: 'missing dimensions', svg: '<svg/>', metadata: STATIC_METADATA },
    {
      name: 'hotspot outside viewBox',
      svg: '<svg viewBox="0 0 16 16"/>',
      metadata: [{ filename: 'cursor.svg', nominal_size: 32, hotspot_x: 17, hotspot_y: 0 }],
    },
    {
      name: 'invalid nominal size',
      svg: svg(),
      metadata: [{ filename: 'cursor.svg', nominal_size: 0, hotspot_x: 0, hotspot_y: 0 }],
    },
  ];

  for (const current of cases) {
    const item = fixture(t, { roles: { default: current } });
    assert.throws(
      () => item.library.importDirectory(item.theme),
      /viewBox|dimension|hotspot|taille|invalide/i,
      current.name,
    );
  }
});

test('enforces role, SVG and XML node limits', (t) => {
  const tooManyRoles = { default: {} };
  for (let index = 1; index < 257; index += 1) tooManyRoles[`role-${String(index).padStart(3, '0')}`] = {};
  const rolesFixture = fixture(t, { roles: tooManyRoles });
  assert.throws(() => rolesFixture.library.importDirectory(rolesFixture.theme), /256|rôles/i);

  const oversizedSvg = `<svg xmlns="http://www.w3.org/2000/svg">${' '.repeat(2 * 1024 * 1024)}</svg>`;
  const svgFixture = fixture(t, { roles: { default: { svg: oversizedSvg } } });
  assert.throws(() => svgFixture.library.importDirectory(svgFixture.theme), /volumineux|2 Mi?o/i);

  const manyNodes = `<svg xmlns="http://www.w3.org/2000/svg">${'<path/>'.repeat(10_001)}</svg>`;
  const nodeFixture = fixture(t, { roles: { default: { svg: manyNodes } } });
  assert.throws(() => nodeFixture.library.importDirectory(nodeFixture.theme), /nœuds|10.?000/i);
});

test('rejects malformed URL segments and stored symlinks', (t) => {
  const item = fixture(t, { roles: importableRoles() });
  const result = item.library.importDirectory(item.theme);
  const asset = result.pack.cursors[0];
  const invalidUrls = [
    'project-media://other/' + result.pack.id + '/000-default',
    `project-media://cursor/${result.pack.id}/../pack.json`,
    `project-media://cursor/${result.pack.id}/%2e%2e%2fpack.json`,
    `${asset.url}?download=1`,
    `${asset.url}#asset`,
    `project-media://cursor/${result.pack.id}/pack.json`,
    'project-media://cursor/not-a-pack/000-default',
  ];
  for (const url of invalidUrls) assert.equal(item.library.fileForUrl(url), null, url);

  const storedFile = item.library.fileForUrl(asset.url);
  assert.ok(storedFile);
  const outside = path.join(item.root, 'outside.svg');
  fs.writeFileSync(outside, svg());
  fs.rmSync(storedFile);
  try {
    fs.symlinkSync(outside, storedFile, 'file');
  } catch {
    t.skip('Creating symlinks is unavailable on this host.');
    return;
  }
  assert.equal(item.library.fileForUrl(asset.url), null);
});
