const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { verifyFfmpegExport } = require('../scripts/native/ffmpeg-export-verify.cjs');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-packaged-export-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'beam-ffmpeg-export'), 'binary', { mode: 0o755 });
  fs.writeFileSync(path.join(root, 'beam-gpu-transport.node'), 'addon');
  return {
    root,
    options: {
      run: () => ({ status: 1, stderr: 'Expected socket, destination, width, height' }),
      load: () => ({ transfer() {} }),
    },
  };
}

test('checks the Beam-only payload, system-linked executable and stable addon entrypoint', (t) => {
  const { root, options } = fixture(t);
  let command;
  assert.deepEqual(
    verifyFfmpegExport(root, {
      ...options,
      run: (...args) => {
        command = args;
        return options.run();
      },
    }),
    { artifacts: 2, ffmpeg: 'system' },
  );
  assert.deepEqual(command, [path.join(root, 'beam-ffmpeg-export'), [], { encoding: 'utf8', timeout: 5000 }]);
});

test('rejects accidentally bundled FFmpeg libraries or additional executables', (t) => {
  const { root, options } = fixture(t);
  fs.mkdirSync(path.join(root, 'lib'));
  fs.writeFileSync(path.join(root, 'lib/libavcodec.so.60'), 'library');
  assert.throws(() => verifyFfmpegExport(root, options), /no bundled FFmpeg libraries/);
  fs.rmSync(path.join(root, 'lib'), { recursive: true });
  fs.writeFileSync(path.join(root, 'ffmpeg'), 'executable');
  assert.throws(() => verifyFfmpegExport(root, options), /no bundled FFmpeg libraries/);
});

test('fails when an executable or addon was omitted from the package', (t) => {
  const { root, options } = fixture(t);
  fs.unlinkSync(path.join(root, 'beam-gpu-transport.node'));
  assert.throws(() => verifyFfmpegExport(root, options), /ENOENT/);
  fs.writeFileSync(path.join(root, 'beam-gpu-transport.node'), 'addon');
  fs.unlinkSync(path.join(root, 'beam-ffmpeg-export'));
  assert.throws(() => verifyFfmpegExport(root, options), /ENOENT/);
});

test('rejects loader failures, unexpected exits and startup timeouts', (t) => {
  const { root, options } = fixture(t);
  for (const result of [
    { status: 127, stderr: 'error while loading shared libraries' },
    { status: 0, stderr: '' },
    { error: new Error('startup timed out') },
  ])
    assert.throws(() => verifyFfmpegExport(root, { ...options, run: () => result }), /startup check/);
});

test('rejects an addon with an incompatible transfer interface', (t) => {
  const { root, options } = fixture(t);
  assert.throws(() => verifyFfmpegExport(root, { ...options, load: () => ({}) }), /transfer entrypoint/);
});
