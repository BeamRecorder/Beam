const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const zlib = require('node:zlib');
const { createCursorPackLibrary } = require('../electron/cursors/cursor-pack-library.cjs');

const STATIC_METADATA = [{ filename: 'cursor.svg', nominal_size: 32, hotspot_x: 1, hotspot_y: 2 }];

const svg = (fill = 'currentColor') =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="16"><path fill="${fill}" d="M0 0h8v8H0z"/></svg>`;

const XCURSOR_IMAGE_TYPE = 0xfffd0002;

function uint32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value >>> 0);
  return buffer;
}

// XCursor stores each pixel as an ARGB uint32, which is BGRA byte order on
// the little-endian platforms that produce the themes Beam imports.
function xcursorBuffer(images) {
  const header = Buffer.concat([Buffer.from('Xcur'), uint32(16), uint32(0x00010000), uint32(images.length)]);
  const tocSize = images.length * 12;
  let offset = 16 + tocSize;
  const toc = [];
  const chunks = [];
  for (const image of images) {
    const pixels = image.pixels
      ? Buffer.from(image.pixels.flatMap(([red, green, blue, alpha]) => [blue, green, red, alpha]))
      : Buffer.alloc(0);
    const chunk = Buffer.concat([
      uint32(36),
      uint32(XCURSOR_IMAGE_TYPE),
      uint32(image.size ?? Math.max(image.width, image.height)),
      uint32(1),
      uint32(image.width),
      uint32(image.height),
      uint32(image.xhot ?? 0),
      uint32(image.yhot ?? 0),
      uint32(image.delay ?? 0),
      pixels,
    ]);
    toc.push(uint32(XCURSOR_IMAGE_TYPE), uint32(image.size ?? Math.max(image.width, image.height)), uint32(offset));
    chunks.push(chunk);
    offset += chunk.length;
  }
  return Buffer.concat([header, ...toc, ...chunks]);
}

function animatedXcursorBuffer(marker, size = 7 * 1024 * 1024) {
  const source = xcursorBuffer([
    { size: 32, width: 1, height: 1, xhot: 0, yhot: 0, pixels: [[marker, 0, 0, 0xff]] },
    { size: 32, width: 1, height: 1, xhot: 0, yhot: 0, pixels: [[0, marker, 0, 0xff]] },
  ]);
  const padded = Buffer.alloc(size);
  source.copy(padded);
  padded[size - 1] = marker;
  return padded;
}

function readPngRgba(file) {
  const input = fs.readFileSync(file);
  assert.deepEqual(input.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  let offset = 8;
  let width;
  let height;
  let colorType;
  const compressed = [];
  while (offset < input.length) {
    const length = input.readUInt32BE(offset);
    const type = input.toString('ascii', offset + 4, offset + 8);
    const data = input.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      assert.equal(data[8], 8);
      colorType = data[9];
    } else if (type === 'IDAT') compressed.push(data);
    else if (type === 'IEND') break;
  }
  assert.equal(colorType, 6, 'XCursor assets must be RGBA PNGs');
  const scanlines = zlib.inflateSync(Buffer.concat(compressed));
  const stride = width * 4;
  const pixels = Buffer.alloc(width * height * 4);
  let sourceOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = scanlines[sourceOffset++];
    const rowOffset = y * stride;
    for (let x = 0; x < stride; x += 1) {
      const raw = scanlines[sourceOffset++];
      const left = x >= 4 ? pixels[rowOffset + x - 4] : 0;
      const above = y > 0 ? pixels[rowOffset - stride + x] : 0;
      const aboveLeft = y > 0 && x >= 4 ? pixels[rowOffset - stride + x - 4] : 0;
      let value = raw;
      if (filter === 1) value = (raw + left) & 0xff;
      else if (filter === 2) value = (raw + above) & 0xff;
      else if (filter === 3) value = (raw + Math.floor((left + above) / 2)) & 0xff;
      else if (filter === 4) {
        const p = left + above - aboveLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - above);
        const pc = Math.abs(p - aboveLeft);
        value = (raw + (pa <= pb && pa <= pc ? left : pb <= pc ? above : aboveLeft)) & 0xff;
      } else assert.equal(filter, 0, `unsupported PNG filter ${filter}`);
      pixels[rowOffset + x] = value;
    }
  }
  return { width, height, pixels };
}

function fixture(t, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-cursor-pack-'));
  const theme = path.join(root, options.themeName || 'theme');
  const scalable = path.join(theme, 'cursors_scalable');
  const compiled = path.join(theme, 'cursors');
  const libraryRoot = path.join(root, 'library');
  if (options.withScalable !== false) fs.mkdirSync(scalable, { recursive: true });
  if (options.xcursorRoles) fs.mkdirSync(compiled, { recursive: true });
  if (options.name !== null)
    fs.writeFileSync(path.join(theme, 'index.theme'), `Name=${options.name || 'Test Theme'}\n`);

  if (options.withScalable !== false) {
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
  }
  for (const [role, contents] of Object.entries(options.xcursorRoles || {}))
    fs.writeFileSync(path.join(compiled, role), contents);

  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, theme, scalable, compiled, libraryRoot, library: createCursorPackLibrary(libraryRoot) };
}

function importableRoles(overrides = {}) {
  return { default: {}, ...overrides };
}

test('imports static XCursor roles as original-color PNG assets', () => {
  const item = fixture(test, {
    withScalable: false,
    xcursorRoles: {
      default: xcursorBuffer([
        {
          size: 24,
          width: 2,
          height: 2,
          xhot: 1,
          yhot: 0,
          pixels: [
            [0x12, 0x34, 0x56, 0xff],
            [0xab, 0xcd, 0xef, 0xff],
            [0x10, 0x20, 0x30, 0xff],
            [0x40, 0x50, 0x60, 0xff],
          ],
        },
      ]),
      left_ptr: xcursorBuffer([
        { size: 24, width: 1, height: 1, xhot: 0, yhot: 0, pixels: [[0xff, 0xff, 0xff, 0xff]] },
      ]),
    },
  });
  const result = item.library.importDirectory(item.theme);

  assert.equal(result.pack.name, 'Test Theme');
  assert.equal(result.pack.colorMode, 'original');
  assert.equal(result.pack.defaultCursorId, 'default');
  assert.equal(result.importedCount, 2);
  const asset = result.pack.cursors.find((cursor) => cursor.id === 'default');
  assert.ok(asset);
  assert.equal(asset.intrinsicSize.width, 2);
  assert.equal(asset.intrinsicSize.height, 2);
  assert.deepEqual(asset.hotspot, { x: 1, y: 0 });
  const storedFile = item.library.fileForUrl(asset.url);
  assert.ok(storedFile);
  assert.equal(path.extname(storedFile), '.png');
  const png = readPngRgba(storedFile);
  assert.deepEqual({ width: png.width, height: png.height }, { width: 2, height: 2 });
  assert.deepEqual(
    [...png.pixels.subarray(0, 16)],
    [0x12, 0x34, 0x56, 0xff, 0xab, 0xcd, 0xef, 0xff, 0x10, 0x20, 0x30, 0xff, 0x40, 0x50, 0x60, 0xff],
  );
});

test('retains duplicate XCursor roles as aliases to equivalent assets', () => {
  const cursor = xcursorBuffer([{ size: 32, width: 1, height: 1, xhot: 0, yhot: 0, pixels: [[0, 0, 0, 0xff]] }]);
  const item = fixture(test, {
    withScalable: false,
    xcursorRoles: { default: cursor, arrow: cursor, left_ptr: cursor },
  });
  const result = item.library.importDirectory(item.theme);

  assert.deepEqual(
    result.pack.cursors.map((asset) => asset.id),
    ['arrow', 'default', 'left_ptr'],
  );
  assert.deepEqual(result.pack.automaticMap, { arrow: 'arrow', default: 'default', left_ptr: 'left_ptr' });
});

test('ignores animated XCursor roles while retaining static roles', () => {
  const item = fixture(test, {
    withScalable: false,
    xcursorRoles: {
      default: xcursorBuffer([{ size: 32, width: 1, height: 1, xhot: 0, yhot: 0, pixels: [[0, 0, 0, 0xff]] }]),
      busy: xcursorBuffer([
        { size: 32, width: 1, height: 1, xhot: 0, yhot: 0, delay: 80, pixels: [[0xff, 0, 0, 0xff]] },
        { size: 32, width: 1, height: 1, xhot: 0, yhot: 0, delay: 80, pixels: [[0, 0, 0xff, 0xff]] },
      ]),
    },
  });
  const result = item.library.importDirectory(item.theme);

  assert.deepEqual(result.ignoredAnimatedRoles, ['busy']);
  assert.equal(result.importedCount, 1);
  assert.deepEqual(
    result.pack.cursors.map((cursor) => cursor.id),
    ['default'],
  );
});

test('rejects invalid, truncated, and out-of-range XCursor images', (t) => {
  const valid = xcursorBuffer([{ size: 32, width: 1, height: 1, xhot: 0, yhot: 0, pixels: [[0, 0, 0, 0xff]] }]);
  const cases = [
    ['bad magic', Buffer.from('not-an-xcursor')],
    ['truncated header', valid.subarray(0, 12)],
    ['zero dimensions', xcursorBuffer([{ size: 32, width: 0, height: 1, xhot: 0, yhot: 0 }])],
    ['dimensions over XCursor limit', xcursorBuffer([{ size: 32, width: 0x8000, height: 1, xhot: 0, yhot: 0 }])],
    [
      'hotspot outside image',
      xcursorBuffer([{ size: 32, width: 1, height: 1, xhot: 2, yhot: 0, pixels: [[0, 0, 0, 0xff]] }]),
    ],
  ];

  for (const [name, contents] of cases) {
    const item = fixture(t, { withScalable: false, xcursorRoles: { default: contents } });
    assert.throws(
      () => item.library.importDirectory(item.theme),
      /XCursor|curseur|image|format|invalide|tronqu|dimension|hotspot/i,
      name,
    );
  }
});

test('enforces the XCursor role-count limit', (t) => {
  const roles = { default: xcursorBuffer([{ size: 16, width: 1, height: 1, pixels: [[0, 0, 0, 0xff]] }]) };
  for (let index = 1; index < 257; index += 1) roles[`role-${String(index).padStart(3, '0')}`] = roles.default;
  const item = fixture(t, { withScalable: false, xcursorRoles: roles });

  assert.throws(() => item.library.importDirectory(item.theme), /256|rôles|roles/i);
});

test('prefers cursors_scalable over compiled XCursor files when both exist', () => {
  const item = fixture(test, {
    roles: { default: { svg: '<svg width="32" height="16"><path fill="currentColor"/></svg>' } },
    xcursorRoles: {
      default: xcursorBuffer([{ size: 8, width: 1, height: 1, xhot: 0, yhot: 0, pixels: [[0xff, 0, 0, 0xff]] }]),
    },
  });
  const result = item.library.importDirectory(item.theme);
  const asset = result.pack.cursors.find((cursor) => cursor.id === 'default');
  assert.ok(asset);
  assert.equal(asset.intrinsicSize.width, 32);
  assert.equal(asset.intrinsicSize.height, 16);
  const storedFile = item.library.fileForUrl(asset.url);
  assert.ok(storedFile);
  assert.equal(path.extname(storedFile), '.svg');
});

test('unwraps a single nested XCursor theme and accepts a direct cursors directory', () => {
  const wrapped = fixture(test, {
    withScalable: false,
    xcursorRoles: {
      default: xcursorBuffer([
        {
          size: 24,
          width: 2,
          height: 1,
          xhot: 1,
          yhot: 0,
          pixels: [
            [0, 0, 0, 0xff],
            [0xff, 0xff, 0xff, 0xff],
          ],
        },
      ]),
    },
  });
  const archiveWrapper = path.join(wrapped.root, 'Moga-Light-Blue-extracted');
  const nestedTheme = path.join(archiveWrapper, 'Moga-Light-Blue');
  fs.mkdirSync(archiveWrapper);
  fs.renameSync(wrapped.theme, nestedTheme);

  const unwrappedResult = wrapped.library.importDirectory(archiveWrapper);
  assert.equal(unwrappedResult.pack.name, 'Test Theme');
  assert.equal(unwrappedResult.importedCount, 1);
  assert.equal(unwrappedResult.pack.cursors[0].intrinsicSize.width, 2);

  const direct = fixture(test, {
    withScalable: false,
    xcursorRoles: {
      default: xcursorBuffer([{ size: 16, width: 1, height: 1, xhot: 0, yhot: 0, pixels: [[0x12, 0x34, 0x56, 0xff]] }]),
    },
  });
  const directResult = direct.library.importDirectory(direct.compiled);
  assert.equal(directResult.pack.name, 'Test Theme');
  assert.equal(directResult.importedCount, 1);
  assert.equal(directResult.pack.cursors[0].intrinsicSize.width, 1);
});

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

test('enforces the global size limit across multiple animated XCursor roles', () => {
  const xcursorRoles = {
    default: xcursorBuffer([{ size: 32, width: 1, height: 1, xhot: 0, yhot: 0, pixels: [[0, 0, 0, 0xff]] }]),
  };
  for (const [index, role] of ['busy', 'progress', 'wait', 'watch', 'working'].entries())
    xcursorRoles[role] = animatedXcursorBuffer(index + 1);

  const item = fixture(test, { withScalable: false, xcursorRoles });

  assert.throws(() => item.library.importDirectory(item.theme), /32 Mio|pack|limite/i);
  assert.deepEqual(item.library.list(), []);
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
