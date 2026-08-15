const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Linux packages use the Beam PNG icon and stable desktop identity', () => {
  const packageJson = require('../package.json');
  const { build } = packageJson;

  assert.equal(packageJson.desktopName, 'com.beam.app');
  assert.equal(build.linux.icon, 'public/brand/BeamIcon.png');
  assert.equal(build.linux.syncDesktopName, true);

  const iconPath = path.resolve(__dirname, '..', build.linux.icon);
  assert.equal(fs.existsSync(iconPath), true);
  const icon = fs.readFileSync(iconPath);
  assert.deepEqual(icon.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  assert.equal(icon.toString('ascii', 12, 16), 'IHDR');
  assert.equal(icon.readUInt32BE(16), 1024);
  assert.equal(icon.readUInt32BE(20), 1024);
});
