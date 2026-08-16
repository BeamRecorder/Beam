const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createFontLibrary, MAX_FONT_BYTES, mimeTypes } = require('../electron/fonts/font-library.cjs');

const repositoryRoot = path.resolve(__dirname, '..');
const fontRoots = [
  path.join(repositoryRoot, 'public', 'font'),
  '/usr/share/fonts',
  '/usr/local/share/fonts',
  process.env.WINDIR ? path.join(process.env.WINDIR, 'Fonts') : null,
  '/Library/Fonts',
  path.join(os.homedir(), 'Library', 'Fonts'),
].filter(Boolean);

function findFontFixture(extension) {
  const pending = [...fontRoots];
  const visited = new Set();
  while (pending.length) {
    const directory = pending.shift();
    if (visited.has(directory)) continue;
    visited.add(directory);
    let entries;
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const candidate = path.join(directory, entry.name);
      if (entry.isDirectory() && !entry.isSymbolicLink()) {
        pending.push(candidate);
        continue;
      }
      if (entry.isFile() && path.extname(entry.name).toLowerCase() === extension) return candidate;
    }
  }
  return null;
}

function libraryForTest(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-font-library-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, library: createFontLibrary(root) };
}

function copyFixture(source, destination) {
  assert.ok(source, 'No usable font fixture is available on this system.');
  fs.copyFileSync(source, destination);
}

test('imports each valid font format available on the host and resolves its opaque URL', async (t) => {
  for (const extension of ['.ttf', '.otf', '.woff', '.woff2']) {
    await t.test(extension, (subtest) => {
      const source = findFontFixture(extension);
      if (!source) {
        subtest.skip(`No ${extension} fixture is available on this host.`);
        return;
      }

      const { root, library } = libraryForTest(subtest);
      const destination = path.join(root, `source${extension}`);
      copyFixture(source, destination);
      const item = library.importFile(destination);
      assert.match(item.id, /^[a-f0-9]{64}$/);
      assert.equal(item.extension, extension);
      assert.ok(item.family);
      assert.ok(item.fullName);
      assert.equal(library.fileForUrl(item.url), path.join(root, `${item.id}${extension}`));
      assert.equal(library.mimeTypeForUrl(item.url), mimeTypes[extension]);
    });
  }
});

test('imports a real TTF, reads its names, hashes it, and serves the expected MIME type', (t) => {
  const { root, library } = libraryForTest(t);
  const source = path.join(root, 'source.ttf');
  copyFixture(findFontFixture('.ttf'), source);

  const item = library.importFile(source);
  assert.match(item.id, /^[a-f0-9]{64}$/);
  assert.equal(item.extension, '.ttf');
  assert.ok(item.family);
  assert.ok(item.fullName);
  assert.equal(item.url, `project-media://font/${item.id}`);
  assert.deepEqual(library.list(), [item]);
  assert.equal(library.fileForUrl(item.url), path.join(root, `${item.id}.ttf`));
  assert.equal(library.mimeTypeForUrl(item.url), 'font/ttf');
  assert.deepEqual(mimeTypes, {
    '.ttf': 'font/ttf',
    '.otf': 'font/otf',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
  });
});

test('rejects unsupported extensions and corrupt font bytes', (t) => {
  const { root, library } = libraryForTest(t);
  const unsupported = path.join(root, 'font.txt');
  fs.writeFileSync(unsupported, 'not a font');
  assert.throws(() => library.importFile(unsupported), /Type de police non autorisé/);

  const corrupt = path.join(root, 'corrupt.ttf');
  fs.writeFileSync(corrupt, 'not a font');
  assert.throws(() => library.importFile(corrupt), /Fichier de police invalide/);
});

test('rejects a font larger than 64 MiB before reading or parsing it', (t) => {
  const { root, library } = libraryForTest(t);
  const oversized = path.join(root, 'oversized.ttf');
  fs.writeFileSync(oversized, Buffer.alloc(0));
  fs.truncateSync(oversized, MAX_FONT_BYTES + 1);
  assert.throws(() => library.importFile(oversized), /64 MiB/);
});

test('deduplicates identical font bytes regardless of the source filename', (t) => {
  const { root, library } = libraryForTest(t);
  const fixture = findFontFixture('.ttf');
  const first = path.join(root, 'first.ttf');
  const second = path.join(root, 'renamed.ttf');
  copyFixture(fixture, first);
  copyFixture(fixture, second);

  const imported = library.importFile(first);
  const duplicate = library.importFile(second);
  assert.deepEqual(duplicate, imported);
  assert.equal(library.list().length, 1);
});

test('rejects traversal, malformed encoding, query, and hash suffixes in font URLs', (t) => {
  const { root, library } = libraryForTest(t);
  const source = path.join(root, 'source.ttf');
  copyFixture(findFontFixture('.ttf'), source);
  const item = library.importFile(source);
  const invalidUrls = [
    `project-media://font/${item.id}/extra`,
    `project-media://font/${item.id}%2f..%2foutside`,
    `project-media://font/%2e%2e%2f${item.id}`,
    `project-media://font/${item.id}?download=1`,
    `project-media://font/${item.id}#preview`,
    'project-media://font/%zz',
  ];

  for (const url of invalidUrls) assert.equal(library.fileForUrl(url), null, url);
  assert.equal(library.fileForUrl(item.url), path.join(root, `${item.id}.ttf`));
});

test('does not resolve a stored symlink outside the font library', (t) => {
  const { root, library } = libraryForTest(t);
  const source = path.join(root, 'source.ttf');
  copyFixture(findFontFixture('.ttf'), source);
  const item = library.importFile(source);
  const stored = path.join(root, `${item.id}.ttf`);
  const outside = path.join(root, 'outside.ttf');
  fs.copyFileSync(stored, outside);
  fs.rmSync(stored);
  fs.symlinkSync(outside, stored);

  assert.deepEqual(library.list(), []);
  assert.equal(library.fileForUrl(item.url), null);
});
