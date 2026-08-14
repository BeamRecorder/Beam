const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  builderPlatform,
  builtFile,
  collectNativeAssets,
  stageDirectory,
  stageNativeFiles,
} = require('../scripts/native/artifacts.cjs');

const VERSION = '1.2.3';

function temporaryRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'beam-native-artifacts-'));
}

function writeSource(root, name, contents = name) {
  const source = path.join(root, 'sources', name);
  fs.mkdirSync(path.dirname(source), { recursive: true });
  fs.writeFileSync(source, contents);
  return source;
}

function stage(
  root,
  platform,
  arch,
  { engine = `${platform}-${arch}-engine`, helper = `${platform}-${arch}-helper` } = {},
) {
  const engineSource = writeSource(root, `${platform}-${arch}-capture-engine`, engine);
  const helperSource = platform === 'linux' ? writeSource(root, `${platform}-${arch}-input-helper`, helper) : null;
  return stageNativeFiles({
    root,
    version: VERSION,
    platform,
    arch,
    engineSource,
    helperSource,
  });
}

test('stages versioned Windows x64 and ARM64 engines in architecture-specific directories', () => {
  const root = temporaryRoot();
  try {
    const x64 = stage(root, 'win32', 'x64');
    const arm64 = stage(root, 'win32', 'arm64');

    assert.equal(x64.length, 1);
    assert.equal(arm64.length, 1);
    assert.equal(x64[0].destination, path.join(root, 'build', 'native', 'win', 'x64', `capture-engine-${VERSION}.exe`));
    assert.equal(
      arm64[0].destination,
      path.join(root, 'build', 'native', 'win', 'arm64', `capture-engine-${VERSION}.exe`),
    );
    assert.notEqual(x64[0].destination, arm64[0].destination);
    assert.equal(fs.readFileSync(x64[0].destination, 'utf8'), 'win32-x64-engine');
    assert.equal(fs.readFileSync(arm64[0].destination, 'utf8'), 'win32-arm64-engine');
    assert.equal(stageDirectory(root, 'win32', 'x64'), path.join(root, 'build', 'native', 'win', 'x64'));
    assert.equal(stageDirectory(root, 'win32', 'arm64'), path.join(root, 'build', 'native', 'win', 'arm64'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('stages the Linux engine and helper with executable permissions and a versioned layout', () => {
  const root = temporaryRoot();
  try {
    const files = stage(root, 'linux', 'x64');
    assert.deepEqual(
      files.map(({ destination }) => path.basename(destination)),
      [`capture-engine-${VERSION}`, `beam-input-helper-${VERSION}`],
    );
    assert.deepEqual(
      files.map(({ destination }) => path.dirname(destination)),
      [path.join(root, 'build', 'native', 'linux', 'x64'), path.join(root, 'build', 'native', 'linux', 'x64')],
    );
    for (const file of files) assert.equal(fs.statSync(file.destination).mode & 0o111, 0o111);
    assert.equal(fs.readFileSync(files[0].destination, 'utf8'), 'linux-x64-engine');
    assert.equal(fs.readFileSync(files[1].destination, 'utf8'), 'linux-x64-helper');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('builtFile includes a cross-compilation target directory', () => {
  const root = path.join('project', 'beam');
  assert.equal(
    builtFile(root, 'capture-engine', 'win32', 'release', 'aarch64-pc-windows-msvc'),
    path.join(root, 'target', 'aarch64-pc-windows-msvc', 'release', 'capture-engine.exe'),
  );
  assert.equal(
    builtFile(root, 'beam-input-helper', 'linux', 'release', null),
    path.join(root, 'target', 'release', 'beam-input-helper'),
  );
});

test('collects staged engines and helper under standalone versioned asset names', () => {
  const root = temporaryRoot();
  const outputDirectory = path.join(root, 'native-assets');
  try {
    stage(root, 'win32', 'x64');
    stage(root, 'win32', 'arm64');
    stage(root, 'darwin', 'arm64');
    stage(root, 'linux', 'x64');

    const collected = collectNativeAssets({ root, outputDirectory, version: VERSION });
    const names = collected.map((file) => path.basename(file)).sort();
    assert.deepEqual(names, [
      `beam-input-helper-${VERSION}-linux-x64`,
      `capture-engine-${VERSION}-linux-x64`,
      `capture-engine-${VERSION}-macos-arm64`,
      `capture-engine-${VERSION}-windows-arm64.exe`,
      `capture-engine-${VERSION}-windows-x64.exe`,
    ]);
    for (const file of collected) assert.equal(fs.existsSync(file), true);

    const linuxAssets = collected.filter((file) => file.includes('-linux-'));
    for (const file of linuxAssets) assert.equal(fs.statSync(file).mode & 0o111, 0o111);
    assert.equal(
      fs.readFileSync(path.join(outputDirectory, `capture-engine-${VERSION}-windows-arm64.exe`), 'utf8'),
      'win32-arm64-engine',
    );
    assert.equal(
      fs.readFileSync(path.join(outputDirectory, `beam-input-helper-${VERSION}-linux-x64`), 'utf8'),
      'linux-x64-helper',
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('unknown targets are rejected and a collector with no staged files fails clearly', () => {
  const root = temporaryRoot();
  try {
    assert.equal(builderPlatform('freebsd'), null);
    assert.equal(stageDirectory(root, 'freebsd', 'x64'), null);
    assert.throws(
      () => stageNativeFiles({ root, version: VERSION, platform: 'freebsd', arch: 'x64' }),
      /Unsupported native target freebsd\/x64/,
    );
    assert.throws(
      () => collectNativeAssets({ root, outputDirectory: path.join(root, 'empty-assets'), version: VERSION }),
      /No staged native engine was found/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
