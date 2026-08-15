const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const assertPng = (relativePath, width, height) => {
  const iconPath = path.resolve(__dirname, '..', relativePath);
  assert.equal(fs.existsSync(iconPath), true);
  const icon = fs.readFileSync(iconPath);
  assert.deepEqual(icon.subarray(0, 8), pngSignature);
  assert.equal(icon.toString('ascii', 12, 16), 'IHDR');
  assert.equal(icon.readUInt32BE(16), width);
  assert.equal(icon.readUInt32BE(20), height);
};

test('desktop packages use the Beam PNG icon and stable desktop identity', () => {
  const packageJson = require('../package.json');
  const { build } = packageJson;

  assert.equal(packageJson.desktopName, 'com.beam.app');
  assert.equal(build.linux.icon, 'public/brand/BeamIcon.png');
  assert.equal(build.mac.icon, 'public/brand/BeamIcon.png');
  assert.equal(build.linux.syncDesktopName, true);

  assertPng(build.linux.icon, 1024, 1024);
  assertPng('public/brand/BeamTrayTemplate.png', 16, 16);
  assertPng('public/brand/BeamTrayTemplate@2x.png', 32, 32);
});
