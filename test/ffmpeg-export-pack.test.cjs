const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { installExperimentalFfmpeg } = require('../scripts/native/ffmpeg-export-pack.cjs');
const { buildFfmpegExport } = require('../scripts/native/ffmpeg-export.cjs');
test('copies the encoder executable and descriptor addon only into Linux package resources', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-ffmpeg-pack-'));
  const source = path.join(directory, 'build/native/ffmpeg-export');
  fs.mkdirSync(source, { recursive: true });
  for (const name of ['beam-ffmpeg-export', 'beam-gpu-transport.node'])
    fs.writeFileSync(path.join(source, name), 'binary', { mode: name.endsWith('.node') ? 0o644 : 0o755 });
  try {
    for (const platform of ['linux', 'darwin', 'win32']) {
      const resources = path.join(directory, platform);
      await installExperimentalFfmpeg(directory, resources, platform);
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
  'does not package an incomplete native build and rejects unusable binaries',
  { skip: process.platform !== 'linux' },
  async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-ffmpeg-pack-'));
    try {
      await installExperimentalFfmpeg(directory, path.join(directory, 'resources'), 'linux');
      assert.equal(fs.existsSync(path.join(directory, 'resources')), false);
      const source = path.join(directory, 'build/native/ffmpeg-export');
      fs.mkdirSync(source, { recursive: true });
      fs.writeFileSync(path.join(source, 'beam-ffmpeg-export'), 'bad', { mode: 0o600 });
      await assert.rejects(installExperimentalFfmpeg(directory, path.join(directory, 'resources'), 'linux'), /EACCES/);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  },
);
test('rejects native builds on unsupported OSes before compiling', () => {
  for (const platform of ['darwin', 'win32']) assert.throws(() => buildFfmpegExport({ platform }), /only on Linux/);
});
