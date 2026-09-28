const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { FEED_NAME, packages, generate, validate } = require('../scripts/release/native-updates.cjs');

const VERSION = '0.3.4';

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-updates-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  for (const asset of new Set(packages(VERSION).map(entry => entry.asset)))
    fs.writeFileSync(path.join(directory, asset), `complete package: ${asset}`);
  return directory;
}

test('native feed freezes full packages for all published targets', async t => {
  const directory = fixture(t);
  const manifest = await generate(directory, VERSION);
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.version, VERSION);
  assert.equal(Object.keys(manifest.platforms).length, 5);
  assert.deepEqual(manifest.platforms['windows-x86_64'], manifest.platforms['windows-aarch64']);
  for (const [target, artifact] of Object.entries(manifest.platforms)) {
    assert.match(artifact.url, /^https:\/\/github\.com\/BeamRecorder\/Beam\/releases\/download\/0\.3\.4\//);
    assert.match(artifact.sha256, /^[a-f0-9]{64}$/);
    assert.ok(artifact.size > 0, target);
  }
  assert.deepEqual(await validate(directory, VERSION), manifest);
  await assert.rejects(generate(directory, VERSION), /EEXIST/);
});

test('CI detects changed package bytes even when the size is unchanged', async t => {
  const directory = fixture(t);
  await generate(directory, VERSION);
  const file = path.join(directory, packages(VERSION)[0].asset);
  const bytes = fs.readFileSync(file);
  bytes[0] ^= 1;
  fs.writeFileSync(file, bytes);
  await assert.rejects(validate(directory, VERSION), /Native update mismatch for linux-x86_64/);
});

test('CI rejects altered version, targets, package URL and format', async t => {
  const directory = fixture(t);
  const original = await generate(directory, VERSION);
  for (const change of [
    value => { value.version = '0.3.5'; },
    value => { value.schemaVersion = 2; },
    value => { delete value.platforms['macos-aarch64']; },
    value => { value.platforms['linux-aarch64'] = value.platforms['linux-x86_64']; },
    value => { value.platforms['windows-x86_64'].url = 'https://example.com/Beam.exe'; },
    value => { value.platforms['linux-x86_64'].format = 'executable'; },
  ]) {
    const value = structuredClone(original);
    change(value);
    fs.writeFileSync(path.join(directory, FEED_NAME), JSON.stringify(value));
    await assert.rejects(validate(directory, VERSION), /Invalid native update|Native update mismatch/);
  }
});

test('CI fails before publishing incomplete or empty packages', async t => {
  const directory = fixture(t);
  const file = path.join(directory, packages(VERSION)[0].asset);
  fs.writeFileSync(file, '');
  await assert.rejects(generate(directory, VERSION), /Invalid native update package/);
  assert.equal(fs.existsSync(path.join(directory, FEED_NAME)), false);
  fs.unlinkSync(file);
  await assert.rejects(generate(directory, VERSION), /ENOENT/);
});

test('feeds accept only stable canonical semantic versions', () => {
  for (const value of ['v0.3.4', '0.3', '0.3.4-beta', '0.3.4+build', '01.3.4', '', '../0.3.4'])
    assert.throws(() => packages(value), /stable semantic version/);
});
