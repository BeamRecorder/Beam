const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const yaml = require('js-yaml');

const {
  METADATA_CONTRACTS,
  sha512,
  validateAllMetadata,
  validateMetadata,
} = require('../scripts/release/artifacts.cjs');
const { expectedEntries, generateNativeManifest, validateNativeManifest } = require('../scripts/release/artifacts.cjs');

const VERSION = '1.2.3';

function withTemporaryDirectory(callback) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-release-artifacts-'));
  try {
    return callback(directory);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

function writeAsset(directory, name, contents = name) {
  const filename = path.join(directory, name);
  fs.writeFileSync(filename, contents);
  return filename;
}

function writeMetadata(directory, name, version, assets) {
  const files = assets.map((asset) => {
    const filename = writeAsset(directory, asset);
    return { url: asset, sha512: sha512(filename) };
  });
  fs.writeFileSync(path.join(directory, name), yaml.dump({ version, files }));
}

function writeAllMetadata(directory, version = VERSION) {
  writeMetadata(directory, 'latest.yml', version, [`Beam-Setup-${version}.exe`]);
  writeMetadata(directory, 'latest-linux.yml', version, [
    `Beam-${version}.AppImage`,
    `beam_${version}_amd64.deb`,
    `beam-${version}.x86_64.rpm`,
  ]);
  writeMetadata(directory, 'latest-mac.yml', version, [`Beam-${version}.dmg`, `Beam-${version}.zip`]);
}

function writeNativeAssets(directory, version = VERSION) {
  return expectedEntries(version).map((entry) => {
    writeAsset(directory, entry.asset, `${entry.platform}/${entry.arch}/${entry.kind}`);
    return entry;
  });
}

test('validates metadata with the package version and all three Linux formats', () => {
  withTemporaryDirectory((directory) => {
    writeAllMetadata(directory);

    const result = validateAllMetadata(directory, VERSION);

    assert.deepEqual(result['latest-linux.yml'].files.sort(), [
      `Beam-${VERSION}.AppImage`,
      `beam-${VERSION}.x86_64.rpm`,
      `beam_${VERSION}_amd64.deb`,
    ]);
    assert.deepEqual(METADATA_CONTRACTS['latest-linux.yml'], ['.AppImage', '.deb', '.rpm']);
  });
});

test('rejects metadata with an incorrect version', () => {
  withTemporaryDirectory((directory) => {
    writeAllMetadata(directory, '1.2.2');

    assert.throws(() => validateAllMetadata(directory, VERSION), /latest\.yml has version 1\.2\.2/);
  });
});

test('rejects a Linux metadata file when a required package is missing', () => {
  withTemporaryDirectory((directory) => {
    writeMetadata(directory, 'latest-linux.yml', VERSION, [`Beam-${VERSION}.AppImage`, `beam_${VERSION}_amd64.deb`]);

    assert.throws(
      () => validateMetadata(directory, 'latest-linux.yml', VERSION, METADATA_CONTRACTS['latest-linux.yml']),
      /does not reference a \.rpm asset/,
    );
  });
});

test('rejects metadata that references a missing file', () => {
  withTemporaryDirectory((directory) => {
    writeMetadata(directory, 'latest-linux.yml', VERSION, [
      `Beam-${VERSION}.AppImage`,
      `beam_${VERSION}_amd64.deb`,
      `beam-${VERSION}.x86_64.rpm`,
    ]);
    fs.rmSync(path.join(directory, `beam-${VERSION}.x86_64.rpm`));

    assert.throws(
      () => validateMetadata(directory, 'latest-linux.yml', VERSION, METADATA_CONTRACTS['latest-linux.yml']),
      /references missing asset beam-1\.2\.3\.x86_64\.rpm/,
    );
  });
});

test('rejects an incorrect SHA-512 in update metadata', () => {
  withTemporaryDirectory((directory) => {
    const asset = `Beam-Setup-${VERSION}.exe`;
    writeMetadata(directory, 'latest.yml', VERSION, [asset]);
    const metadataPath = path.join(directory, 'latest.yml');
    const metadata = yaml.load(fs.readFileSync(metadataPath, 'utf8'));
    metadata.files[0].sha512 = 'not-the-file-hash';
    fs.writeFileSync(metadataPath, yaml.dump(metadata));

    assert.throws(
      () => validateMetadata(directory, 'latest.yml', VERSION, METADATA_CONTRACTS['latest.yml']),
      /latest\.yml has an invalid SHA-512/,
    );
  });
});

test('rejects standalone capture-engine and helper assets from every latest manifest', () => {
  for (const [name, requiredExtensions] of Object.entries(METADATA_CONTRACTS)) {
    withTemporaryDirectory((directory) => {
      const requiredAssets = requiredExtensions.map((extension) => `Beam-${VERSION}${extension}`);
      writeMetadata(directory, name, VERSION, [
        ...requiredAssets,
        `capture-engine-${VERSION}-windows-x64.exe`,
        `beam-input-helper-${VERSION}-linux-x64`,
      ]);

      assert.throws(
        () => validateMetadata(directory, name, VERSION, requiredExtensions),
        new RegExp(`${name} must not reference standalone native assets`),
      );
    });
  }
});

test('generates and validates the complete native manifest for every supported engine', () => {
  withTemporaryDirectory((directory) => {
    const entries = writeNativeAssets(directory);
    const manifestPath = generateNativeManifest(directory, VERSION);
    const manifest = validateNativeManifest(directory, VERSION);

    assert.equal(path.basename(manifestPath), `native-engines-${VERSION}.json`);
    assert.equal(manifest.version, VERSION);
    assert.deepEqual(
      manifest.files.map(({ kind, platform, arch, asset }) => ({ kind, platform, arch, asset })),
      entries,
    );
    assert.deepEqual(entries.map(({ kind, platform, arch }) => `${kind}:${platform}/${arch}`).sort(), [
      'beam-input-helper:linux/x64',
      'capture-engine:darwin/arm64',
      'capture-engine:linux/x64',
      'capture-engine:win32/arm64',
      'capture-engine:win32/x64',
    ]);
  });
});

test('rejects a corrupted native SHA-256', () => {
  withTemporaryDirectory((directory) => {
    writeNativeAssets(directory);
    const manifestPath = generateNativeManifest(directory, VERSION);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.files[0].sha256 = '0'.repeat(64);
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    assert.throws(() => validateNativeManifest(directory, VERSION), /Invalid SHA-256/);
  });
});
