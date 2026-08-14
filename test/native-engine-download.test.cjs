const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  RELEASE_BASE_URL,
  downloadNativeFiles,
  fetchBuffer,
  manifestEntries,
  requiredNativeFiles,
  validateManifestEntry,
  writeVerifiedFile,
} = require('../scripts/native/download.cjs');
const { nativeManifestAssetName } = require('../electron/capture/capture-engine-path.cjs');

const version = '1.2.3';

function temporaryRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'beam-native-download-'));
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function response(bytes, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  };
}

test('required native files are exact for Windows, macOS, and Linux helper payloads', () => {
  const root = temporaryRoot();
  try {
    const windows = requiredNativeFiles(root, version, 'win32', 'arm64');
    assert.deepEqual(windows, [
      {
        kind: 'capture-engine',
        asset: `capture-engine-${version}-windows-arm64.exe`,
        destination: path.join(root, 'packages', 'native-recorder', 'win', 'arm64', `capture-engine-${version}.exe`),
      },
    ]);

    const mac = requiredNativeFiles(root, version, 'darwin', 'arm64');
    assert.equal(mac.length, 1);
    assert.equal(mac[0].asset, `capture-engine-${version}-macos-arm64`);
    assert.match(mac[0].destination, /native-recorder[\/]mac[\/]arm64[\/]capture-engine-1\.2\.3$/);

    const linux = requiredNativeFiles(root, version, 'linux', 'x64');
    assert.equal(linux.length, 2);
    assert.deepEqual(
      linux.map(({ kind, asset }) => ({ kind, asset })),
      [
        { kind: 'capture-engine', asset: `capture-engine-${version}-linux-x64` },
        { kind: 'beam-input-helper', asset: `beam-input-helper-${version}-linux-x64` },
      ],
    );

    assert.equal(requiredNativeFiles(root, version, 'linux', 'arm64'), null);
    assert.equal(requiredNativeFiles(root, '1.2', 'win32', 'x64'), null);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('manifest validation requires the requested version, platform, architecture, asset, and lowercase SHA-256', () => {
  const required = {
    kind: 'capture-engine',
    asset: `capture-engine-${version}-windows-x64.exe`,
  };
  const valid = {
    version,
    files: [
      {
        kind: required.kind,
        platform: 'win32',
        arch: 'x64',
        asset: required.asset,
        sha256: 'a'.repeat(64),
      },
    ],
  };

  assert.deepEqual(manifestEntries(valid, version), valid.files);
  assert.deepEqual(validateManifestEntry(valid.files, required, 'win32', 'x64'), valid.files[0]);
  assert.throws(() => manifestEntries({ ...valid, version: '1.2.4' }, version), /invalid version/);
  assert.throws(() => manifestEntries({ version, files: {} }, version), /invalid version/);
  assert.throws(() => validateManifestEntry(valid.files, required, 'darwin', 'arm64'), /no valid capture-engine entry/);
  assert.throws(
    () => validateManifestEntry([{ ...valid.files[0], asset: 'other' }], required, 'win32', 'x64'),
    /no valid capture-engine entry/,
  );
  assert.throws(
    () => validateManifestEntry([{ ...valid.files[0], sha256: 'A'.repeat(64) }], required, 'win32', 'x64'),
    /no valid capture-engine entry/,
  );
});

test('fetchBuffer reports HTTP failures and follows successful binary responses', async () => {
  const bytes = Buffer.from([1, 2, 3]);
  let request;
  assert.deepEqual(
    await fetchBuffer('https://example.test/engine', async (url, options) => {
      request = { url, options };
      return response(bytes);
    }),
    bytes,
  );
  assert.deepEqual(request, { url: 'https://example.test/engine', options: { redirect: 'follow' } });
  await assert.rejects(
    fetchBuffer('https://example.test/missing', async () => response(Buffer.alloc(0), 404)),
    /Download failed \(404\)/,
  );
});

test('writeVerifiedFile verifies before an atomic rename, preserves executable mode, and leaves no temp file', async () => {
  const root = temporaryRoot();
  const destination = path.join(root, 'linux', 'capture-engine');
  const bytes = Buffer.from('verified engine');
  try {
    await writeVerifiedFile(destination, bytes, sha256(bytes), 'linux');
    assert.deepEqual(fs.readFileSync(destination), bytes);
    assert.equal(fs.statSync(destination).mode & 0o111, 0o111);
    assert.deepEqual(fs.readdirSync(path.dirname(destination)), ['capture-engine']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a corrupted SHA-256 never creates or replaces the destination', async () => {
  const root = temporaryRoot();
  const destination = path.join(root, 'capture-engine');
  const bytes = Buffer.from('corrupted engine');
  try {
    await assert.rejects(
      writeVerifiedFile(destination, bytes, '0'.repeat(64), 'linux'),
      /SHA-256 mismatch for capture-engine/,
    );
    assert.equal(fs.existsSync(destination), false);
    assert.equal(fs.existsSync(root) && fs.readdirSync(root).length, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('downloadNativeFiles downloads and atomically installs all Linux files from a verified manifest', async () => {
  const root = temporaryRoot();
  const base = 'https://example.test/releases';
  const release = `${base}/${version}`;
  const engine = Buffer.from('linux capture engine');
  const helper = Buffer.from('linux input helper');
  try {
    const required = requiredNativeFiles(root, version, 'linux', 'x64');
    assert.ok(required);
    const bytesByAsset = new Map([
      [required[0].asset, engine],
      [required[1].asset, helper],
    ]);
    const manifest = {
      version,
      files: required.map((file) => ({
        kind: file.kind,
        platform: 'linux',
        arch: 'x64',
        asset: file.asset,
        sha256: sha256(bytesByAsset.get(file.asset)),
      })),
    };
    const manifestName = nativeManifestAssetName(version);
    const requested = [];
    const installed = await downloadNativeFiles({
      applicationRoot: root,
      version,
      platform: 'linux',
      arch: 'x64',
      releaseBaseUrl: base,
      fetchImpl: async (url, options) => {
        requested.push({ url, options });
        if (url === `${release}/${manifestName}`) return response(Buffer.from(JSON.stringify(manifest)));
        const asset = decodeURIComponent(url.slice(`${release}/`.length));
        const bytes = bytesByAsset.get(asset);
        return bytes ? response(bytes) : response(Buffer.alloc(0), 404);
      },
    });

    assert.deepEqual(
      installed,
      required.map(({ destination }) => destination),
    );
    assert.deepEqual(fs.readFileSync(required[0].destination), engine);
    assert.deepEqual(fs.readFileSync(required[1].destination), helper);
    assert.equal(fs.statSync(required[0].destination).mode & 0o111, 0o111);
    assert.equal(fs.statSync(required[1].destination).mode & 0o111, 0o111);
    assert.equal(requested[0].url, `${release}/${manifestName}`);
    assert.equal(requested.length, 3);
    assert.equal(requested[1].url, `${release}/${encodeURIComponent(required[0].asset)}`);
    assert.equal(requested[2].url, `${release}/${encodeURIComponent(required[1].asset)}`);
    assert.equal(RELEASE_BASE_URL, 'https://github.com/ExtraBinoss/Beam/releases/download');
    for (const file of required) {
      assert.equal(
        fs.readdirSync(path.dirname(file.destination)).some((name) => name.endsWith('.tmp')),
        false,
      );
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('downloadNativeFiles rejects a corrupted engine before writing any native file', async () => {
  const root = temporaryRoot();
  const base = 'https://example.test/releases';
  const release = `${base}/${version}`;
  const engine = Buffer.from('not the manifest hash');
  try {
    const required = requiredNativeFiles(root, version, 'win32', 'x64');
    assert.ok(required);
    const manifest = {
      version,
      files: [
        {
          kind: 'capture-engine',
          platform: 'win32',
          arch: 'x64',
          asset: required[0].asset,
          sha256: 'f'.repeat(64),
        },
      ],
    };
    await assert.rejects(
      downloadNativeFiles({
        applicationRoot: root,
        version,
        platform: 'win32',
        arch: 'x64',
        releaseBaseUrl: base,
        fetchImpl: async (url) => {
          if (url.endsWith(nativeManifestAssetName(version))) return response(Buffer.from(JSON.stringify(manifest)));
          return response(engine);
        },
      }),
      /SHA-256 mismatch/,
    );
    assert.equal(fs.existsSync(required[0].destination), false);
    assert.equal(fs.existsSync(path.dirname(required[0].destination)), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
