const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const AFTER_INSTALL = path.join(__dirname, '..', 'build', 'linux', 'after-install.sh');

function writeCallShim(directory, tool) {
  const shim = path.join(directory, 'shim', tool);
  fs.writeFileSync(shim, '#!/bin/sh\nprintf "%s: %s\\n" "$(basename "$0")" "$*" >> "$SHIM_CALLS"\n');
  fs.chmodSync(shim, 0o755);
}

function runAfterInstall(directory, { withHelper, withSandbox } = {}) {
  const helperDirectory = path.join(directory, '/opt/Beam/resources/input-helper');
  fs.mkdirSync(helperDirectory, { recursive: true });
  if (withHelper) {
    const helper = path.join(helperDirectory, 'beam-input-helper-1.2.3');
    fs.writeFileSync(helper, '#!/bin/sh\nprintf "%s" "$1" > "$MARKER"\n');
    fs.chmodSync(helper, 0o755);
  }
  if (withSandbox) {
    fs.writeFileSync(path.join(directory, '/opt/Beam/chrome-sandbox'), '');
  }
  const script = path.join(directory, 'after-install.sh');
  fs.writeFileSync(
    script,
    fs
      .readFileSync(AFTER_INSTALL, 'utf8')
      .replaceAll('/opt/Beam', path.join(directory, '/opt/Beam'))
      .replaceAll('/opt/beam', path.join(directory, '/opt/beam')),
  );
  const shimDirectory = path.join(directory, 'shim');
  fs.mkdirSync(shimDirectory, { recursive: true });
  writeCallShim(directory, 'chown');
  writeCallShim(directory, 'chmod');
  return spawnSync('sh', [script], {
    env: {
      ...process.env,
      MARKER: path.join(directory, 'called'),
      SHIM_CALLS: path.join(directory, 'shim-calls'),
      PATH: `${shimDirectory}${path.delimiter}${process.env.PATH}`,
    },
    encoding: 'utf8',
  });
}

function shimCalls(directory) {
  const marker = path.join(directory, 'shim-calls');
  return fs.existsSync(marker) ? fs.readFileSync(marker, 'utf8').trim().split('\n') : [];
}

function withTempDirectory(callback) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-postinst-'));
  try {
    callback(directory);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test('after-install runs the versioned input helper install', { skip: process.platform === 'win32' }, () => {
  withTempDirectory((directory) => {
    const result = runAfterInstall(directory, { withHelper: true });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.readFileSync(path.join(directory, 'called'), 'utf8'), 'install');
  });
});

test('after-install fails when no input helper is packaged', { skip: process.platform === 'win32' }, () => {
  withTempDirectory((directory) => {
    const result = runAfterInstall(directory, {});

    assert.equal(result.status, 1);
    assert.match(result.stderr, /Beam input helper was not found/);
  });
});

test('after-install makes chrome-sandbox root-owned with the SUID bit', { skip: process.platform === 'win32' }, () => {
  withTempDirectory((directory) => {
    const result = runAfterInstall(directory, { withHelper: true, withSandbox: true });
    const sandbox = path.join(directory, '/opt/Beam/chrome-sandbox');

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(shimCalls(directory), [
      `chown: root:root ${sandbox}`,
      `chmod: 4755 ${sandbox}`,
    ]);
  });
});

test('after-install fixes chrome-sandbox even without the input helper', { skip: process.platform === 'win32' }, () => {
  withTempDirectory((directory) => {
    const result = runAfterInstall(directory, { withSandbox: true });
    const sandbox = path.join(directory, '/opt/Beam/chrome-sandbox');

    assert.equal(result.status, 1);
    assert.match(result.stderr, /Beam input helper was not found/);
    assert.deepEqual(shimCalls(directory), [
      `chown: root:root ${sandbox}`,
      `chmod: 4755 ${sandbox}`,
    ]);
  });
});

test('after-install leaves a missing chrome-sandbox untouched', { skip: process.platform === 'win32' }, () => {
  withTempDirectory((directory) => {
    const result = runAfterInstall(directory, { withHelper: true });

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(shimCalls(directory), []);
  });
});
