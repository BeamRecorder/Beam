const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { inspectFfmpegLibraries } = require('../scripts/native/ffmpeg-export-license.cjs');

const linux = { skip: process.platform !== 'linux' };
const libraries = ['avcodec', 'avutil', 'avfilter', 'avformat'];

function fixture(t, { shared = true, gplLibrary } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-ffmpeg-library-info-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const run = (command, args, options) => spawnSync(command, args, { encoding: 'utf8', ...options });
  const compile = (args) => {
    const result = run(process.env.CXX || 'c++', args);
    assert.equal(result.status, 0, result.stderr);
  };
  const configuration = '--enable-shared "custom path"\\config\n\t--disable-gpl';
  const sources = [];
  for (const library of libraries) {
    const source = path.join(root, `${library}.cc`);
    const license = library === gplLibrary ? 'GPL version 2 or later' : 'LGPL version 2.1 or later';
    fs.writeFileSync(
      source,
      `extern "C" const char *${library}_license() { return ${JSON.stringify(license)}; }\n` +
        `extern "C" const char *${library}_configuration() { return ${JSON.stringify(configuration)}; }\n`,
    );
    sources.push(source);
    if (shared) compile(['-shared', '-fPIC', source, '-o', path.join(root, `lib${library}.so.60`)]);
  }
  const main = path.join(root, 'main.cc');
  fs.writeFileSync(
    main,
    `#include "ffmpeg-library-info.h"
extern "C" const char *avcodec_license();
const char *(*volatile anchor)() = avcodec_license;
int main(int argc, char **argv) {
  try {
    if (argc == 3) beam::print_json_string(argv[2]);
    else beam::print_ffmpeg_library_info();
    return 0;
  } catch (const std::exception &error) {
    std::cerr << error.what();
    return 1;
  }
}
`,
  );
  const executable = path.join(root, 'probe');
  // Non-PIE function references can have executable PLT addresses despite dynamic linkage.
  compile([
    '-std=c++17',
    '-Wall',
    '-Wextra',
    '-Werror',
    '-fno-pie',
    '-no-pie',
    '-I',
    path.resolve('packages/encoder/native/linux'),
    main,
    ...(shared
      ? ['-Wl,--no-as-needed', ...libraries.map((library) => path.join(root, `lib${library}.so.60`))]
      : sources),
    '-ldl',
    '-o',
    executable,
  ]);
  return { root, executable, configuration, run };
}

test('reports real shared-library origins rather than executable PLT trampolines', linux, (t) => {
  const { root, executable, configuration } = fixture(t);
  const records = inspectFfmpegLibraries(executable);
  for (let index = 0; index < libraries.length; index++) {
    assert.equal(records[index].library, libraries[index]);
    assert.equal(records[index].path, path.join(root, `lib${libraries[index]}.so.60`));
    assert.equal(records[index].configuration, configuration);
  }
});

test('escapes quotes, backslashes, control characters and Unicode as valid JSON', linux, (t) => {
  const { executable, run } = fixture(t);
  for (const value of ['', 'normal', 'quote"slash\\', '\n\t\u0001', 'éclair']) {
    const result = run(executable, ['--string', value]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout), value);
  }
});

test('rejects a real GPL library mixed into the LGPL shared libraries', linux, (t) => {
  const { executable } = fixture(t, { gplLibrary: 'avfilter' });
  assert.throws(() => inspectFfmpegLibraries(executable), /avfilter must be LGPL; found GPL/);
});

test('rejects statically compiled implementations instead of reporting them as shared libraries', linux, (t) => {
  const { executable } = fixture(t, { shared: false });
  assert.throws(() => inspectFfmpegLibraries(executable), /Cannot inspect dynamically linked avcodec/);
});
