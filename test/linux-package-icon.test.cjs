const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const zlib = require('node:zlib');

const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const icnsSignature = Buffer.from('icns', 'ascii');

const readPng = (relativePath) => {
  const iconPath = path.resolve(__dirname, '..', relativePath);
  assert.equal(fs.existsSync(iconPath), true, `missing PNG ${relativePath}`);
  const icon = fs.readFileSync(iconPath);
  assert.deepEqual(icon.subarray(0, 8), pngSignature, `invalid PNG signature for ${relativePath}`);

  let width;
  let height;
  let bitDepth;
  let colorType;
  let interlaceMethod;
  const imageData = [];
  let offset = 8;
  while (offset < icon.length) {
    assert.ok(offset + 12 <= icon.length, `truncated PNG chunk header at ${offset}`);
    const length = icon.readUInt32BE(offset);
    const type = icon.toString('ascii', offset + 4, offset + 8);
    assert.ok(offset + 12 + length <= icon.length, `PNG chunk ${type} exceeds the file length`);
    const data = icon.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlaceMethod = data[12];
    } else if (type === 'IDAT') {
      imageData.push(data);
    }
    offset += 12 + length;
  }

  assert.equal(offset, icon.length, `truncated PNG data for ${relativePath}`);
  assert.equal(typeof width, 'number', `PNG ${relativePath} has no IHDR chunk`);
  assert.ok(imageData.length > 0, `PNG ${relativePath} has no IDAT chunks`);
  return { width, height, bitDepth, colorType, interlaceMethod, imageData };
};

const assertPng = (relativePath, width, height) => {
  const png = readPng(relativePath);
  assert.equal(png.width, width, `unexpected width for ${relativePath}`);
  assert.equal(png.height, height, `unexpected height for ${relativePath}`);
  return png;
};

const decodeRgba = (relativePath) => {
  const png = readPng(relativePath);
  assert.equal(png.bitDepth, 8, `${relativePath} must use 8-bit channels`);
  assert.equal(png.colorType, 6, `${relativePath} must contain a real RGBA channel`);
  assert.equal(png.interlaceMethod, 0, `${relativePath} must not be interlaced`);

  const bytesPerRow = png.width * 4;
  const decoded = zlib.inflateSync(Buffer.concat(png.imageData));
  const rows = [];
  let offset = 0;
  let previous = Buffer.alloc(bytesPerRow);
  const paeth = (left, above, upperLeft) => {
    const estimate = left + above - upperLeft;
    const leftDistance = Math.abs(estimate - left);
    const aboveDistance = Math.abs(estimate - above);
    const upperLeftDistance = Math.abs(estimate - upperLeft);
    if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) return left;
    return aboveDistance <= upperLeftDistance ? above : upperLeft;
  };

  for (let y = 0; y < png.height; y += 1) {
    const filter = decoded[offset++];
    const row = Buffer.alloc(bytesPerRow);
    for (let x = 0; x < bytesPerRow; x += 1) {
      const value = decoded[offset++];
      const left = x >= 4 ? row[x - 4] : 0;
      const above = previous[x];
      const upperLeft = x >= 4 ? previous[x - 4] : 0;
      if (filter === 0) row[x] = value;
      else if (filter === 1) row[x] = (value + left) & 0xff;
      else if (filter === 2) row[x] = (value + above) & 0xff;
      else if (filter === 3) row[x] = (value + Math.floor((left + above) / 2)) & 0xff;
      else if (filter === 4) row[x] = (value + paeth(left, above, upperLeft)) & 0xff;
      else assert.fail(`unsupported PNG filter ${filter} in ${relativePath}`);
    }
    rows.push(row);
    previous = row;
  }

  assert.equal(offset, decoded.length, `unexpected PNG payload length for ${relativePath}`);
  return (x, y) => rows[y].subarray(x * 4, x * 4 + 4);
};

const assertIco = (relativePath, expectedSizes) => {
  const iconPath = path.resolve(__dirname, '..', relativePath);
  assert.equal(fs.existsSync(iconPath), true, `missing ICO ${relativePath}`);
  const icon = fs.readFileSync(iconPath);
  assert.equal(icon.readUInt16LE(0), 0, `invalid ICO reserved field for ${relativePath}`);
  assert.equal(icon.readUInt16LE(2), 1, `invalid ICO type for ${relativePath}`);
  const imageCount = icon.readUInt16LE(4);
  const sizes = [];
  for (let index = 0; index < imageCount; index += 1) {
    const entryOffset = 6 + index * 16;
    assert.ok(entryOffset + 16 <= icon.length, `truncated ICO directory for ${relativePath}`);
    sizes.push([icon[entryOffset] || 256, icon[entryOffset + 1] || 256]);
  }
  assert.deepEqual(
    sizes,
    expectedSizes.map((size) => [size, size]),
    `unexpected ICO sizes for ${relativePath}`,
  );
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
  assert.equal(build.linux.icon, 'build/icons/linux');
  assert.equal(build.win.icon, 'public/brand/BeamIcon.ico');
  assert.equal(build.mac.icon, 'public/brand/BeamIcon.icns');
  assert.equal(build.linux.syncDesktopName, true);

  for (const size of [16, 24, 32, 48, 64, 96, 128, 256, 512]) {
    assertPng(path.join(build.linux.icon, `${size}x${size}.png`), size, size);
  }

  assertPng('public/brand/BeamIcon.png', 1024, 1024);
  const pixel = decodeRgba('public/brand/BeamIcon.png');
  const corners = [pixel(0, 0), pixel(1023, 0), pixel(0, 1023), pixel(1023, 1023)];
  assert.ok(
    corners.every((rgba) => rgba[3] === 0),
    'BeamIcon.png corners must be fully transparent',
  );
  assert.equal(pixel(512, 512)[3], 255, 'BeamIcon.png center must remain fully opaque');

  const appWebIcon = fs.readFileSync(path.resolve(__dirname, '../public/brand/BeamIcon.webp'));
  const websiteIcon = fs.readFileSync(path.resolve(__dirname, '../website/public/favicon.webp'));
  assert.deepEqual(websiteIcon, appWebIcon, 'website and application must use the same Beam icon');

  assertIco(build.win.icon, [16, 20, 24, 32, 40, 48, 64, 128, 256]);
  assertIcns(build.mac.icon, ['icp4', 'icp5', 'icp6', 'ic07', 'ic08', 'ic09', 'ic10']);
  assertPng('public/brand/BeamTray.png', 24, 24);
  assertPng('public/brand/BeamTray@2x.png', 48, 48);
  assert.equal(
    fs.readFileSync(path.join(build.linux.icon, '48x48.png')).equals(fs.readFileSync('public/brand/BeamTray@2x.png')),
    false,
    'Linux app and tray icons must differ byte-for-byte',
  );
  assert.equal(
    fs.readFileSync(build.win.icon).equals(fs.readFileSync('public/brand/BeamTray.ico')),
    false,
    'Windows app and tray icons must differ byte-for-byte',
  );
  assertPng('public/brand/BeamTrayTemplate.png', 16, 16);
  assertPng('public/brand/BeamTrayTemplate@2x.png', 32, 32);
});

test('Linux package lifecycle hooks refresh desktop and icon caches', () => {
  for (const relativePath of [
    'build/linux/after-install.sh',
    'build/linux/deb-after-remove.sh',
    'build/linux/rpm-after-remove.sh',
  ]) {
    const script = fs.readFileSync(path.resolve(__dirname, '..', relativePath), 'utf8');
    assert.match(script, /update-desktop-database\s+\/usr\/share\/applications/);
    assert.match(script, /gtk-update-icon-cache\s+--force\s+\/usr\/share\/icons\/hicolor/);
  }
});
