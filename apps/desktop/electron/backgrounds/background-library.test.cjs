const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createBackgroundLibrary } = require('./background-library.cjs');

const setup = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-background-library-'));
  const paths = {
    wallpaperImages: path.join(root, 'images'),
    wallpaperVideos: path.join(root, 'videos'),
  };
  fs.mkdirSync(paths.wallpaperImages, { recursive: true });
  fs.mkdirSync(paths.wallpaperVideos, { recursive: true });
  return { root, paths };
};

test('lists library media behind opaque project-media URLs and resolves the file', () => {
  const item = setup();
  try {
    fs.writeFileSync(path.join(item.paths.wallpaperVideos, 'slow & steady.mp4'), 'video');
    const library = createBackgroundLibrary(item.paths);
    const [media] = library.list();

    assert.equal(media.kind, 'video');
    assert.match(media.path, /^project-media:\/\/background\/video\//);
    assert.equal(library.fileForUrl(media.path), path.join(item.paths.wallpaperVideos, 'slow & steady.mp4'));
  } finally {
    fs.rmSync(item.root, { recursive: true, force: true });
  }
});
test('rejects traversal and malformed background URLs', () => {
  const item = setup();
  try {
    fs.writeFileSync(path.join(item.paths.wallpaperVideos, 'safe.mp4'), 'video');
    const library = createBackgroundLibrary(item.paths);
    const invalidUrls = [
      'project-media://background/video/%2e%2e%2foutside.mp4',
      'project-media://background/video/..%2foutside.mp4',
      'project-media://background/video/%252e%252e%252foutside.mp4',
      'project-media://background/video/safe.mp4/extra',
      'project-media://background/image/safe.mp4',
      'project-media://background/video/safe.txt',
      'project-media://other/video/safe.mp4',
    ];

    for (const url of invalidUrls) assert.equal(library.fileForUrl(url), null, url);
  } finally {
    fs.rmSync(item.root, { recursive: true, force: true });
  }
});

test('rejects a background filename that resolves outside the library root', () => {
  const item = setup();
  const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-background-secret-'));
  try {
    const outsideFile = path.join(outsideRoot, 'secret.mp4');
    const link = path.join(item.paths.wallpaperVideos, 'linked.mp4');
    fs.writeFileSync(outsideFile, 'private');
    fs.symlinkSync(outsideFile, link);

    const library = createBackgroundLibrary(item.paths);
    assert.equal(library.fileForUrl('project-media://background/video/linked.mp4'), null);
  } finally {
    fs.rmSync(item.root, { recursive: true, force: true });
    fs.rmSync(outsideRoot, { recursive: true, force: true });
  }
});
