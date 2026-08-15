const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createWhisperModelStore, REQUIRED_PATHS, REVISIONS } = require('../electron/captions/whisper-model-store.cjs');

const model = 'Xenova/whisper-tiny';
const root = () => fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-store-'));
const fixture = () =>
  Object.fromEntries([...REQUIRED_PATHS].map((file, index) => [file, Buffer.from(`artifact-${index}`)]));
const gitBlobSha1 = (file) => crypto.createHash('sha1').update(`blob ${file.length}\0`).update(file).digest('hex');
const fetchFor =
  (files, { lfs = true } = {}) =>
  async (url, options = {}) => {
    if (url.includes('/tree/'))
      return new Response(
        JSON.stringify(
          [...REQUIRED_PATHS].map((file) => ({
            type: 'file',
            path: file,
            size: files[file].length,
            ...(lfs
              ? { lfs: { oid: crypto.createHash('sha256').update(files[file]).digest('hex') } }
              : { oid: gitBlobSha1(files[file]) }),
          })),
        ),
        { status: 200 },
      );
    const artifact = [...REQUIRED_PATHS].find((file) => url.endsWith(`/${file}`));
    if (!artifact) return new Response('', { status: 404 });
    const offset = Number(String(options.headers?.Range || 'bytes=0-').match(/\d+/)?.[0] || 0);
    return new Response(files[artifact].subarray(offset), { status: offset ? 206 : 200 });
  };
test('reports an absent model without making a network request', async () => {
  const requests = [];
  const store = createWhisperModelStore(root(), async (...args) => {
    requests.push(args);
    throw new Error('network should not be used for absent state');
  });

  assert.deepEqual(await store.state(model), {
    id: model,
    status: 'missing',
    downloadedBytes: 0,
    totalBytes: 0,
    revision: REVISIONS[model],
  });
  assert.equal(requests.length, 0);
});
test('verifies a valid local manifest without making a network request', async () => {
  const files = fixture();
  const modelRoot = root();
  const directory = path.join(modelRoot, model);
  const hashes = {};
  for (const file of REQUIRED_PATHS) {
    const target = path.join(directory, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, files[file]);
    hashes[file] = {
      algorithm: 'sha256',
      value: crypto.createHash('sha256').update(files[file]).digest('hex'),
    };
  }
  fs.writeFileSync(
    path.join(directory, 'manifest.json'),
    JSON.stringify({
      revision: REVISIONS[model],
      hashes,
      totalBytes: Object.values(files).reduce((total, file) => total + file.length, 0),
    }),
  );
  const store = createWhisperModelStore(modelRoot, async () => {
    throw new Error('network should not be used for a valid local manifest');
  });

  const result = await store.state(model);

  assert.equal(result.status, 'ready');
  assert.equal(result.downloadedBytes, result.totalBytes);
  assert.equal(
    result.totalBytes,
    Object.values(files).reduce((total, file) => total + file.length, 0),
  );
});
test('continues to fetch the manifest and artifacts when downloading an absent model', async () => {
  const files = fixture();
  const requests = [];
  const fetchBase = fetchFor(files);
  const store = createWhisperModelStore(root(), async (...args) => {
    requests.push(args);
    return fetchBase(...args);
  });

  const result = await store.download(model);

  assert.equal(result.status, 'ready');
  assert.equal(requests.length, REQUIRED_PATHS.size + 1);
  assert.equal(requests.filter(([url]) => url.includes('/tree/')).length, 1);
  assert.equal(requests.filter(([url]) => url.includes('/resolve/')).length, REQUIRED_PATHS.size);
});
test('downloads a pinned manifest, verifies hashes and reports actual total size', async () => {
  const files = fixture();
  const store = createWhisperModelStore(root(), fetchFor(files));
  const progress = [];
  const result = await store.download(model, (item) => progress.push(item));
  assert.equal(result.status, 'ready');
  assert.equal(
    result.totalBytes,
    Object.values(files).reduce((total, file) => total + file.length, 0),
  );
  assert.ok(progress.length > 0);
});
test('resumes a partial artifact using a range request', async () => {
  const files = fixture();
  const modelRoot = root();
  const directory = path.join(modelRoot, model);
  fs.mkdirSync(path.join(directory, 'onnx'), { recursive: true });
  const partial = path.join(directory, 'onnx', 'encoder_model_quantized.onnx.partial');
  fs.writeFileSync(partial, files['onnx/encoder_model_quantized.onnx'].subarray(0, 3));
  const store = createWhisperModelStore(modelRoot, fetchFor(files));
  const result = await store.download(model);
  assert.equal(result.status, 'ready');
  assert.equal(
    fs
      .readFileSync(path.join(directory, 'onnx', 'encoder_model_quantized.onnx'))
      .equals(files['onnx/encoder_model_quantized.onnx']),
    true,
  );
});
test('verifies regular Hugging Face files with their Git blob hash', async () => {
  const files = fixture();
  const store = createWhisperModelStore(root(), fetchFor(files, { lfs: false }));
  const result = await store.download(model);
  assert.equal(result.status, 'ready');
});
test('coalesces concurrent downloads and fans out progress to every caller', async () => {
  const files = fixture();
  const fetchBase = fetchFor(files);
  const artifactRequests = new Map();
  const fetchImpl = async (url, options = {}) => {
    const artifact = [...REQUIRED_PATHS].find((file) => url.endsWith(`/${file}`));
    if (artifact) artifactRequests.set(artifact, (artifactRequests.get(artifact) || 0) + 1);
    return fetchBase(url, options);
  };
  const store = createWhisperModelStore(root(), fetchImpl);
  const firstProgress = [];
  const secondProgress = [];

  const first = store.download(model, (event) => firstProgress.push(event));
  const second = store.download(model, (event) => secondProgress.push(event));
  const [firstResult, secondResult] = await Promise.all([first, second]);

  assert.equal(firstResult.status, 'ready');
  assert.equal(secondResult.status, 'ready');
  assert.ok(firstProgress.length > 0);
  assert.deepEqual(secondProgress, firstProgress);
  for (const artifact of REQUIRED_PATHS) assert.equal(artifactRequests.get(artifact), 1, artifact);
});
test('cleans up a rejected download so the next attempt can retry', async () => {
  const files = fixture();
  const fetchBase = fetchFor(files);
  const artifactAttempts = new Map();
  let failNextArtifact = true;
  const fetchImpl = async (url, options = {}) => {
    const artifact = [...REQUIRED_PATHS].find((file) => url.endsWith(`/${file}`));
    if (artifact) {
      artifactAttempts.set(artifact, (artifactAttempts.get(artifact) || 0) + 1);
      if (failNextArtifact) {
        failNextArtifact = false;
        return new Response('', { status: 503 });
      }
    }
    return fetchBase(url, options);
  };
  const store = createWhisperModelStore(root(), fetchImpl);

  await assert.rejects(() => store.download(model), /Téléchargement Whisper impossible/);
  const result = await store.download(model);

  assert.equal(result.status, 'ready');
  assert.equal(artifactAttempts.get('added_tokens.json'), 2);
});
test('rejects invalid models and keeps the custom protocol inside the model root', async () => {
  const store = createWhisperModelStore(root(), fetchFor(fixture()));
  await assert.rejects(() => store.state('Xenova/not-whisper'), /invalide/);
  assert.equal(store.fileForUrl('whisper-model://models/../../etc/passwd'), null);
  assert.equal(store.fileForUrl('file:///etc/passwd'), null);
});
