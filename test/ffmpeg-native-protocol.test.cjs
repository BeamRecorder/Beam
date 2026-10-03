const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
test(
  'validates native descriptor boundaries independently of a GPU or FFmpeg',
  { skip: process.platform !== 'linux' },
  () => {
    const compiler = spawnSync(process.env.CXX || 'c++', ['--version']);
    assert.equal(compiler.status, 0, 'A C++ compiler is required for native protocol tests.');
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-gpu-protocol-'));
    try {
      const binary = path.join(directory, 'protocol');
      const build = spawnSync(
        process.env.CXX || 'c++',
        [
          '-std=c++17',
          '-Wall',
          '-Wextra',
          '-Werror',
          '-I',
          path.resolve(__dirname, '../packages/encoder/native/linux'),
          path.join(__dirname, 'fixtures/ffmpeg-export/protocol.cc'),
          '-o',
          binary,
        ],
        { encoding: 'utf8' },
      );
      assert.equal(build.status, 0, build.stderr);
      const result = spawnSync(binary, [], { encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /validation passed/);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  },
);
