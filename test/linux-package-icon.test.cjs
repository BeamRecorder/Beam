const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const icnsSignature = Buffer.from('icns', 'ascii');

const assertPng = (relativePath, width, height) => {
  const iconPath = path.resolve(__dirname, '..', relativePath);
  assert.equal(fs.existsSync(iconPath), true);
  const icon = fs.readFileSync(iconPath);
  assert.deepEqual(icon.subarray(0, 8), pngSignature);
  assert.equal(icon.toString('ascii', 12, 16), 'IHDR');
  assert.equal(icon.readUInt32BE(16), width);
  assert.equal(icon.readUInt32BE(20), height);
};

const assertIcns = (relativePath, expectedTypes) => {
  const iconPath = path.resolve(__dirname, '..', relativePath);
  assert.equal(fs.existsSync(iconPath), true);
  const icon = fs.readFileSync(iconPath);
  assert.deepEqual(icon.subarray(0, 4), icnsSignature);
  assert.equal(icon.readUInt32BE(4), icon.length);

  const chunks = new Set();
  let offset = 8;
  while (offset < icon.length) {
    assert.ok(offset + 8 <= icon.length, `truncated ICNS chunk header at ${offset}`);
    const type = icon.toString('ascii', offset, offset + 4);
    const length = icon.readUInt32BE(offset + 4);
    assert.ok(length >= 8, `invalid ICNS chunk length for ${type}`);
    assert.ok(offset + length <= icon.length, `ICNS chunk ${type} exceeds the file length`);
    chunks.add(type);
    offset += length;
  }
  assert.equal(offset, icon.length);
  for (const type of expectedTypes) assert.equal(chunks.has(type), true, `missing ICNS chunk ${type}`);
};

test('desktop packages use the Beam PNG icon and stable desktop identity', () => {
  const packageJson = require('../package.json');
  const { build } = packageJson;

  assert.equal(packageJson.desktopName, 'com.beam.app');
  assert.equal(build.linux.icon, 'public/brand/BeamIcon.png');
  assert.equal(build.mac.icon, 'public/brand/BeamIcon.icns');
  assert.equal(build.linux.syncDesktopName, true);

  assertPng(build.linux.icon, 1024, 1024);
  assertIcns(build.mac.icon, ['icp4', 'icp5', 'icp6', 'ic07', 'ic08', 'ic09', 'ic10']);
  assertPng('public/brand/BeamTrayTemplate.png', 16, 16);
  assertPng('public/brand/BeamTrayTemplate@2x.png', 32, 32);
});
