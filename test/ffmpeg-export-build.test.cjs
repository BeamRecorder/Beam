const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildFfmpegExport } = require('../scripts/native/ffmpeg-export.cjs');
const { lgplRecords } = require('./fixtures/ffmpeg-export/licenses.cjs');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-ffmpeg-build-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const calls = [];
  const env = { CXX: 'beam-test-c++', BEAM_NODE_INCLUDE: '/node/include', LD_LIBRARY_PATH: '/lgpl/lib' };
  const run = (command, args, options) => {
    calls.push({ command, args, options });
    if (command === 'pkg-config')
      return { status: 0, stdout: '-I/lgpl/include -L/lgpl/lib -lavcodec -lavutil -lavfilter -lavformat -lva -ldrm' };
    if (args.includes('--ffmpeg-info')) return { status: 0, stdout: JSON.stringify(lgplRecords()) };
    return { status: 0 };
  };
  return { root, platform: 'linux', env, run, calls };
}

test('compiles separate native artifacts and checks actual LGPL libraries with the same environment', (t) => {
  const options = fixture(t);
  const directory = buildFfmpegExport(options);
  assert.equal(directory, path.join(options.root, 'build/native/ffmpeg-export'));
  assert.equal(fs.existsSync(directory), true);
  assert.equal(options.calls.length, 4);
  assert.equal(options.calls[0].options.env, options.env);
  assert.ok(options.calls[1].args.includes('-lavcodec'));
  assert.ok(options.calls[1].args.includes('-ldl'));
  assert.ok(options.calls[2].args.includes('-DNAPI_VERSION=8'));
  assert.ok(!options.calls[2].args.includes('-lavcodec'));
  assert.deepEqual(options.calls[3].args, ['--ffmpeg-info']);
  assert.equal(options.calls[3].options.env, options.env);
});

test('supports explicit trusted flags while preserving the LGPL check', (t) => {
  const options = fixture(t);
  options.env.BEAM_FFMPEG_BUILD_FLAGS = '-I/custom/include -L/custom/lib -lavcodec';
  buildFfmpegExport(options);
  assert.ok(options.calls[1].args.includes('-I/custom/include'));
  assert.ok(options.calls[3].args.includes('--ffmpeg-info'));
});

test('fails without FFmpeg development packages before creating native artifacts', (t) => {
  const options = fixture(t);
  assert.throws(() => buildFfmpegExport({ ...options, run: () => ({ status: 1 }) }), /development packages/);
  assert.equal(fs.existsSync(path.join(options.root, 'build/native')), false);
});

test('fails when a compiler errors instead of verifying an old artifact', (t) => {
  const options = fixture(t);
  for (const result of [{ status: 1 }, { error: new Error('compiler unavailable') }])
    assert.throws(
      () =>
        buildFfmpegExport({
          ...options,
          run: (command, ...args) => (command === options.env.CXX ? result : options.run(command, ...args)),
        }),
      /Cannot build beam-ffmpeg-export/,
    );
  assert.ok(!options.calls.some((call) => call.args.includes('--ffmpeg-info')));
});

test('fails completed builds that loaded GPL libraries or report a static origin', (t) => {
  const options = fixture(t);
  for (const override of [{ license: 'GPL version 2 or later' }, { path: '/beam-ffmpeg-export' }]) {
    const records = lgplRecords();
    Object.assign(records[0], override);
    assert.throws(
      () =>
        buildFfmpegExport({
          ...options,
          run: (command, args, extra) =>
            args.includes('--ffmpeg-info')
              ? { status: 0, stdout: JSON.stringify(records) }
              : options.run(command, args, extra),
        }),
      /must be LGPL|dynamically linked/,
    );
  }
});
