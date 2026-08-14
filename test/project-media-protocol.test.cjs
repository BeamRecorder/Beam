const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  createProjectMediaHandler,
  mimeTypeFor,
} = require('../electron/projects/project-media-protocol.cjs');

function fixture(contents = Buffer.from('0123456789')) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-project-media-'));
  const file = path.join(root, 'asset.mp4');
  fs.writeFileSync(file, contents);
  const url = 'project-media://asset/asset.mp4';
  const projectStore = {
    mediaFileForUrl: (candidate) => (candidate === url ? file : null),
  };
  const handler = createProjectMediaHandler({ projectStore });
  return { root, file, url, handler };
}

function request(url, range) {
  return new Request(url, range ? { headers: { Range: range } } : undefined);
}

async function responseBody(response) {
  return Buffer.from(await response.arrayBuffer());
}

function assertCommonHeaders(response, contentLength, contentType = 'video/mp4') {
  assert.equal(response.headers.get('accept-ranges'), 'bytes');
  assert.equal(response.headers.get('content-length'), String(contentLength));
  assert.equal(response.headers.get('content-type'), contentType);
  assert.equal(response.headers.get('access-control-allow-origin'), '*');
}

test('serves the complete file without a Range header', async () => {
  const item = fixture();
  try {
    const response = await item.handler(request(item.url));
    assert.equal(response.status, 200);
    assertCommonHeaders(response, 10);
    assert.deepEqual(await responseBody(response), Buffer.from('0123456789'));
  } finally {
    fs.rmSync(item.root, { recursive: true, force: true });
  }
});

test('serves closed, open-ended, and suffix byte ranges', async (t) => {
  const cases = [
    { name: 'closed', range: 'bytes=2-5', expected: '2345', contentRange: 'bytes 2-5/10' },
    { name: 'open-ended', range: 'bytes=7-', expected: '789', contentRange: 'bytes 7-9/10' },
    { name: 'suffix', range: 'bytes=-4', expected: '6789', contentRange: 'bytes 6-9/10' },
  ];

  for (const current of cases) {
    await t.test(current.name, async () => {
      const item = fixture();
      try {
        const response = await item.handler(request(item.url, current.range));
        assert.equal(response.status, 206);
        assert.equal(response.headers.get('content-range'), current.contentRange);
        assertCommonHeaders(response, current.expected.length);
        assert.deepEqual(await responseBody(response), Buffer.from(current.expected));
      } finally {
        fs.rmSync(item.root, { recursive: true, force: true });
      }
    });
  }
});

test('returns 416 and bytes */size for malformed or unsatisfiable ranges', async (t) => {
  const cases = [
    ['missing byte unit', 'items=2-4'],
    ['multiple ranges', 'bytes=1-2,4-5'],
    ['non-numeric range', 'bytes=hello-world'],
    ['reversed range', 'bytes=8-2'],
    ['start beyond end of file', 'bytes=10-'],
    ['start far beyond end of file', 'bytes=999-1000'],
    ['zero suffix', 'bytes=-0'],
  ];

  for (const [name, range] of cases) {
    await t.test(name, async () => {
      const item = fixture();
      try {
        const response = await item.handler(request(item.url, range));
        assert.equal(response.status, 416);
        assert.equal(response.headers.get('content-range'), 'bytes */10');
        assert.equal(response.headers.get('access-control-allow-origin'), '*');
        assert.equal(response.headers.get('accept-ranges'), 'bytes');
      } finally {
        fs.rmSync(item.root, { recursive: true, force: true });
      }
    });
  }
});

test('handles an empty file and rejects every non-empty range', async (t) => {
  await t.test('without Range', async () => {
    const item = fixture(Buffer.alloc(0));
    try {
      const response = await item.handler(request(item.url));
      assert.equal(response.status, 200);
      assertCommonHeaders(response, 0);
      assert.deepEqual(await responseBody(response), Buffer.alloc(0));
    } finally {
      fs.rmSync(item.root, { recursive: true, force: true });
    }
  });

  await t.test('with Range', async () => {
    const item = fixture(Buffer.alloc(0));
    try {
      const response = await item.handler(request(item.url, 'bytes=0-'));
      assert.equal(response.status, 416);
      assert.equal(response.headers.get('content-range'), 'bytes */0');
      assert.equal(response.headers.get('access-control-allow-origin'), '*');
    } finally {
      fs.rmSync(item.root, { recursive: true, force: true });
    }
  });
});

test('returns 404 when the project store has no file for the URL', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-project-media-'));
  const existing = path.join(root, 'existing.mp4');
  fs.writeFileSync(existing, 'do not serve this');
  const url = 'project-media://asset/missing.mp4';
  const handler = createProjectMediaHandler({ projectStore: { mediaFileForUrl: () => null } });
  try {
    const response = await handler(request(url));
    assert.equal(response.status, 404);
    assert.deepEqual(await responseBody(response), Buffer.from('Not found'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('serves opaque background-library URLs and preserves range semantics', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-background-media-'));
  const file = path.join(root, 'wallpaper.mp4');
  const url = 'project-media://background/video/wallpaper.mp4';
  fs.writeFileSync(file, 'background');
  const handler = createProjectMediaHandler({
    projectStore: { mediaFileForUrl: () => null },
    backgroundLibrary: {
      fileForUrl: (candidate) => (candidate === url ? file : null),
    },
  });
  try {
    const response = await handler(request(url, 'bytes=2-5'));
    assert.equal(response.status, 206);
    assert.equal(response.headers.get('content-range'), 'bytes 2-5/10');
    assert.equal(response.headers.get('content-type'), 'video/mp4');
    assert.deepEqual(await responseBody(response), Buffer.from('ckgr'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('does not serve traversal URLs from the background-library resolver', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-background-media-'));
  const secret = path.join(root, 'secret.mp4');
  fs.writeFileSync(secret, 'private');
  const handler = createProjectMediaHandler({
    projectStore: { mediaFileForUrl: () => null },
    backgroundLibrary: { fileForUrl: () => null },
  });
  try {
    for (const url of [
      'project-media://background/video/%2e%2e%2fsecret.mp4',
      'project-media://background/video/..%2fsecret.mp4',
    ]) {
      const response = await handler(request(url));
      assert.equal(response.status, 404, url);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('serves only the exact path selected by projectStore', async (t) => {
  await t.test('does not derive a path from an unrecognized URL', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-project-media-'));
    const secret = path.join(root, 'secret.mp4');
    fs.writeFileSync(secret, 'private');
    const allowedUrl = 'project-media://asset/allowed.mp4';
    const handler = createProjectMediaHandler({
      projectStore: { mediaFileForUrl: (candidate) => (candidate === allowedUrl ? null : null) },
    });
    try {
      const response = await handler(request('project-media://asset/secret.mp4'));
      assert.equal(response.status, 404);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  await t.test('uses the store-selected path even when the URL names another asset', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-project-media-'));
    const selected = path.join(root, 'selected.mp4');
    const other = path.join(root, 'other.mp4');
    fs.writeFileSync(selected, 'selected content');
    fs.writeFileSync(other, 'other content');
    const handler = createProjectMediaHandler({
      projectStore: { mediaFileForUrl: () => selected },
    });
    try {
      const response = await handler(request('project-media://asset/other.mp4'));
      assert.equal(response.status, 200);
      assert.deepEqual(await responseBody(response), Buffer.from('selected content'));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

test('maps all supported media extensions to their MIME types', () => {
  const expected = {
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mov': 'video/quicktime',
    '.mkv': 'video/x-matroska',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.m4a': 'audio/mp4',
    '.aac': 'audio/aac',
    '.ogg': 'audio/ogg',
    '.flac': 'audio/flac',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.webp': 'image/webp',
  };

  for (const [extension, mime] of Object.entries(expected)) {
    assert.equal(mimeTypeFor(`asset${extension}`), mime, extension);
    assert.equal(mimeTypeFor(`ASSET${extension}`), mime, `case-insensitive ${extension}`);
  }
});

test('uses the selected file extension for the response MIME type', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-project-media-'));
  const files = [
    ['clip.webm', 'video/webm'],
    ['clip.mov', 'video/quicktime'],
    ['clip.mkv', 'video/x-matroska'],
    ['clip.mp3', 'audio/mpeg'],
    ['clip.wav', 'audio/wav'],
    ['clip.m4a', 'audio/mp4'],
    ['clip.aac', 'audio/aac'],
    ['clip.ogg', 'audio/ogg'],
    ['clip.flac', 'audio/flac'],
    ['clip.png', 'image/png'],
    ['clip.jpg', 'image/jpeg'],
    ['clip.webp', 'image/webp'],
  ];
  try {
    for (const [name, mime] of files) {
      const file = path.join(root, name);
      fs.writeFileSync(file, 'x');
      const url = `project-media://asset/${name}`;
      const handler = createProjectMediaHandler({
        projectStore: { mediaFileForUrl: (candidate) => (candidate === url ? file : null) },
      });
      const response = await handler(request(url));
      assert.equal(response.status, 200, name);
      assert.equal(response.headers.get('content-type'), mime, name);
      assert.equal(response.headers.get('content-length'), '1', name);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
