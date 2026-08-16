const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Readable, Writable } = require('node:stream');
const test = require('node:test');

const {
  askDownload,
  cargoAvailable,
  cargoBuildArguments,
  parseDevelopmentArguments,
  resolveDevelopmentEngine,
} = require('../scripts/dev/electron.cjs');
const { requiredNativeFiles } = require('../scripts/native/download.cjs');

const version = '1.2.3';

function temporaryRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'beam-electron-dev-'));
}

function writeExecutable(candidate) {
  fs.mkdirSync(path.dirname(candidate), { recursive: true });
  fs.writeFileSync(candidate, 'native engine fixture');
  fs.chmodSync(candidate, 0o755);
}

function cacheRequiredFiles(root, platform = 'win32', arch = 'x64') {
  const files = requiredNativeFiles(root, version, platform, arch);
  assert.ok(files);
  for (const file of files) writeExecutable(file.destination);
  return files;
}

test('cargoAvailable distinguishes Cargo from a missing executable and checks its exit code', () => {
  let invoked;
  assert.equal(
    cargoAvailable((command, args, options) => {
      invoked = { command, args, options };
      return { status: 0 };
    }),
    true,
  );
  assert.deepEqual(invoked, { command: 'cargo', args: ['--version'], options: { stdio: 'ignore' } });

  assert.equal(
    cargoAvailable(() => ({ error: Object.assign(new Error('missing'), { code: 'ENOENT' }) })),
    false,
  );
  assert.throws(() => cargoAvailable(() => ({ status: 1 })), /cargo --version failed/);
});

test('build arguments compile the engine and the Linux helper, with release and target controls', () => {
  assert.deepEqual(cargoBuildArguments('linux'), [
    'build',
    '-p',
    'capture',
    '--bin',
    'capture-engine',
    '--bin',
    'beam-input-helper',
  ]);
  assert.deepEqual(cargoBuildArguments('win32', true, 'aarch64-pc-windows-msvc'), [
    'build',
    '-p',
    'capture',
    '--bin',
    'capture-engine',
    '--release',
    '--target',
    'aarch64-pc-windows-msvc',
  ]);
});

test('development arguments enable the forced no-Rust path only when requested', () => {
  assert.deepEqual(parseDevelopmentArguments(), { forceNoRust: false });
  assert.deepEqual(parseDevelopmentArguments([]), { forceNoRust: false });
  assert.deepEqual(parseDevelopmentArguments(['--force-no-rust']), { forceNoRust: true });
});

test('development arguments reject unsupported options', () => {
  assert.throws(() => parseDevelopmentArguments(['--skip-build']), /Unknown electron:dev option: --skip-build/);
});

test('Cargo-present development builds are used directly', async () => {
  const root = temporaryRoot();
  const calls = [];
  try {
    const executable = await resolveDevelopmentEngine({
      applicationRoot: root,
      version,
      platform: 'win32',
      arch: 'x64',
      hasCargo: () => true,
      build: async (options) => calls.push(options),
    });
    assert.equal(executable, path.join(root, 'target', 'debug', 'capture-engine.exe'));
    assert.deepEqual(calls, [{ platform: 'win32' }]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a Cargo compilation error fails without silently falling back to cache or download', async () => {
  const root = temporaryRoot();
  let downloadCalls = 0;
  try {
    await assert.rejects(
      resolveDevelopmentEngine({
        applicationRoot: root,
        version,
        platform: 'win32',
        arch: 'x64',
        hasCargo: () => true,
        build: async () => {
          throw new Error('compiler failed');
        },
        download: async () => {
          downloadCalls += 1;
        },
      }),
      /compiler failed/,
    );
    assert.equal(downloadCalls, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Cargo-absent development uses an exact cached engine without prompting or downloading', async () => {
  const root = temporaryRoot();
  let promptCalls = 0;
  let downloadCalls = 0;
  try {
    const files = cacheRequiredFiles(root);
    const executable = await resolveDevelopmentEngine({
      applicationRoot: root,
      version,
      platform: 'win32',
      arch: 'x64',
      hasCargo: () => false,
      stdin: { isTTY: true },
      stdout: { isTTY: true },
      prompt: async () => {
        promptCalls += 1;
        return false;
      },
      download: async () => {
        downloadCalls += 1;
      },
    });
    assert.equal(executable, files[0].destination);
    assert.equal(promptCalls, 0);
    assert.equal(downloadCalls, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('interactive confirmation accepts Y and rejects N while the default is yes', async () => {
  const ask = async (answer) => {
    const input = Readable.from([answer]);
    input.isTTY = true;
    const outputChunks = [];
    const output = new Writable({
      write(chunk, _encoding, callback) {
        outputChunks.push(chunk.toString());
        callback();
      },
    });
    output.isTTY = true;
    const result = await askDownload(version, input, output);
    return { result, output: outputChunks.join('') };
  };

  const yes = await ask('Y\n');
  assert.equal(yes.result, true);
  assert.ok(yes.output.includes(`Download capture-engine ${version}? [Y/n]`));

  const no = await ask('N\n');
  assert.equal(no.result, false);

  const empty = await ask('\n');
  assert.equal(empty.result, true);
});

test('interactive N refuses a missing cache without downloading', async () => {
  const root = temporaryRoot();
  let downloadCalls = 0;
  try {
    await assert.rejects(
      resolveDevelopmentEngine({
        applicationRoot: root,
        version,
        platform: 'win32',
        arch: 'x64',
        hasCargo: () => false,
        stdin: { isTTY: true },
        stdout: { isTTY: true },
        prompt: async () => false,
        download: async () => {
          downloadCalls += 1;
        },
      }),
      /not cached/,
    );
    assert.equal(downloadCalls, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('non-interactive terminals refuse by default and allow only explicit opt-in download', async () => {
  const root = temporaryRoot();
  try {
    let downloadCalls = 0;
    await assert.rejects(
      resolveDevelopmentEngine({
        applicationRoot: root,
        version,
        platform: 'win32',
        arch: 'x64',
        env: {},
        stdin: { isTTY: false },
        stdout: { isTTY: false },
        hasCargo: () => false,
        download: async () => {
          downloadCalls += 1;
        },
      }),
      /allow the verified download/,
    );
    assert.equal(downloadCalls, 0);

    let received;
    const executable = await resolveDevelopmentEngine({
      applicationRoot: root,
      version,
      platform: 'win32',
      arch: 'x64',
      env: { BEAM_DOWNLOAD_CAPTURE_ENGINE: '1' },
      stdin: { isTTY: false },
      stdout: { isTTY: false },
      hasCargo: () => false,
      download: async (options) => {
        received = options;
        cacheRequiredFiles(root, 'win32', 'x64');
      },
    });
    assert.equal(executable, requiredNativeFiles(root, version, 'win32', 'x64')[0].destination);
    assert.equal(received.version, version);
    assert.equal(received.platform, 'win32');
    assert.equal(received.arch, 'x64');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('unknown architectures fail before Cargo detection or fallback', async () => {
  const root = temporaryRoot();
  let cargoChecked = false;
  try {
    await assert.rejects(
      resolveDevelopmentEngine({
        applicationRoot: root,
        version,
        platform: 'linux',
        arch: 'arm64',
        hasCargo: () => {
          cargoChecked = true;
          return false;
        },
      }),
      /no capture-engine build for linux\/arm64/,
    );
    assert.equal(cargoChecked, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
