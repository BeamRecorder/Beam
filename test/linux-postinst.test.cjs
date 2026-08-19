const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const AFTER_INSTALL = path.join(__dirname, '..', 'build', 'linux', 'after-install.sh');

function runAfterInstall(directory, helperVersions) {
  const helperDirectory = path.join(directory, '/opt/Beam/resources/input-helper');
  fs.mkdirSync(helperDirectory, { recursive: true });
  for (const version of helperVersions) {
    const helper = path.join(helperDirectory, `beam-input-helper-${version}`);
    fs.writeFileSync(helper, '#!/bin/sh\nprintf "%s %s" "${0##*/}" "$1" > "$MARKER"\n');
    fs.chmodSync(helper, 0o755);
  }
  const script = path.join(directory, 'after-install.sh');
  fs.writeFileSync(
    script,
    fs
      .readFileSync(AFTER_INSTALL, 'utf8')
      .replaceAll('/opt/Beam', path.join(directory, '/opt/Beam'))
      .replaceAll('/opt/beam', path.join(directory, '/opt/beam')),
  );
  return spawnSync('sh', [script], {
    env: { ...process.env, MARKER: path.join(directory, 'called') },
    encoding: 'utf8',
  });
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
    const result = runAfterInstall(directory, ['1.2.3']);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.readFileSync(path.join(directory, 'called'), 'utf8'), 'beam-input-helper-1.2.3 install');
  });
});

test(
  'after-install selects the newest helper while RPM versions coexist',
  { skip: process.platform === 'win32' },
  () => {
    withTempDirectory((directory) => {
      const result = runAfterInstall(directory, ['1.2.3', '1.2.4', '1.10.0']);

      assert.equal(result.status, 0, result.stderr);
      assert.equal(fs.readFileSync(path.join(directory, 'called'), 'utf8'), 'beam-input-helper-1.10.0 install');
    });
  },
);

test('after-install fails when no input helper is packaged', { skip: process.platform === 'win32' }, () => {
  withTempDirectory((directory) => {
    const result = runAfterInstall(directory, []);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /Beam input helper was not found/);
  });
});
