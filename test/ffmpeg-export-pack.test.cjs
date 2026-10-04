const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { installExperimentalFfmpeg } = require('../scripts/native/ffmpeg-export-pack.cjs');
const { buildFfmpegExport } = require('../scripts/native/ffmpeg-export.cjs');
const inspectedFixture = { inspect() {} };
test('copies the encoder executable and descriptor addon only into Linux package resources', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-ffmpeg-pack-'));
  const source = path.join(directory, 'build/native/ffmpeg-export');
  fs.mkdirSync(source, { recursive: true });
  for (const name of ['beam-ffmpeg-export', 'beam-gpu-transport.node'])
    fs.writeFileSync(path.join(source, name), 'binary', { mode: name.endsWith('.node') ? 0o644 : 0o755 });
  try {
    for (const platform of ['linux', 'darwin', 'win32']) {
      const resources = path.join(directory, platform);
      await installExperimentalFfmpeg(directory, resources, platform, inspectedFixture);
      assert.equal(fs.existsSync(path.join(resources, 'ffmpeg-export')), platform === 'linux');
    }
    assert.deepEqual(fs.readdirSync(path.join(directory, 'linux/ffmpeg-export')).sort(), [
      'beam-ffmpeg-export',
      'beam-gpu-transport.node',
    ]);
    fs.accessSync(path.join(directory, 'linux/ffmpeg-export/beam-ffmpeg-export'), fs.constants.X_OK);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
test(
  'fails Linux packaging for an incomplete native build or unusable binaries',
  { skip: process.platform !== 'linux' },
  async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-ffmpeg-pack-'));
    try {
      await assert.rejects(installExperimentalFfmpeg(directory, path.join(directory, 'resources'), 'linux'), /ENOENT/);
      assert.equal(fs.existsSync(path.join(directory, 'resources')), false);
      const source = path.join(directory, 'build/native/ffmpeg-export');
      fs.mkdirSync(source, { recursive: true });
      fs.writeFileSync(path.join(source, 'beam-ffmpeg-export'), 'bad', { mode: 0o600 });
      fs.writeFileSync(path.join(source, 'beam-gpu-transport.node'), 'addon');
      await assert.rejects(installExperimentalFfmpeg(directory, path.join(directory, 'resources'), 'linux'), /EACCES/);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  },
);
test('rejects native builds on unsupported OSes before compiling', () => {
  for (const platform of ['darwin', 'win32']) assert.throws(() => buildFfmpegExport({ platform }), /only on Linux/);
});

test('removes obsolete codec payloads and never copies FFmpeg or libraries from a native build', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-ffmpeg-no-bundle-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const source = path.join(directory, 'build/native/ffmpeg-export');
  const resources = path.join(directory, 'resources');
  fs.mkdirSync(path.join(source, 'lib'), { recursive: true });
  for (const name of ['beam-ffmpeg-export', 'beam-gpu-transport.node', 'ffmpeg'])
    fs.writeFileSync(path.join(source, name), 'binary', { mode: 0o755 });
  fs.writeFileSync(path.join(source, 'lib/libavcodec.so.60'), 'codec');
  const destination = path.join(resources, 'ffmpeg-export');
  fs.mkdirSync(path.join(destination, 'lib'), { recursive: true });
  fs.writeFileSync(path.join(destination, 'lib/libavcodec.so.60'), 'obsolete codec');
  await installExperimentalFfmpeg(directory, resources, 'linux', inspectedFixture);
  assert.deepEqual(fs.readdirSync(destination).sort(), ['beam-ffmpeg-export', 'beam-gpu-transport.node']);
  assert.equal(fs.existsSync(path.join(source, 'lib/libavcodec.so.60')), true);
});

test('rejects non-LGPL artifacts before changing package resources', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-ffmpeg-license-pack-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const source = path.join(directory, 'build/native/ffmpeg-export');
  const resources = path.join(directory, 'resources');
  fs.mkdirSync(source, { recursive: true });
  for (const name of ['beam-ffmpeg-export', 'beam-gpu-transport.node'])
    fs.writeFileSync(path.join(source, name), 'binary', { mode: 0o755 });
  let inspected;
  await assert.rejects(
    installExperimentalFfmpeg(directory, resources, 'linux', {
      inspect(executable) {
        inspected = executable;
        throw new Error('avcodec must be LGPL');
      },
    }),
    /must be LGPL/,
  );
  assert.equal(inspected, path.join(source, 'beam-ffmpeg-export'));
  assert.equal(fs.existsSync(resources), false);
});
