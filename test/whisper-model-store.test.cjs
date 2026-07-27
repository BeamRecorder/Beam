const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const { createWhisperModelStore, REQUIRED_PATHS } = require('../electron/captions/whisper-model-store.cjs')

const model = 'Xenova/whisper-tiny'
const root = () => fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-store-'))
const fixture = () => Object.fromEntries([...REQUIRED_PATHS].map((file, index) => [file, Buffer.from(`artifact-${index}`)]))
const gitBlobSha1 = (file) => crypto.createHash('sha1').update(`blob ${file.length}\0`).update(file).digest('hex')
const fetchFor = (files, { lfs = true } = {}) => async (url, options = {}) => {
  if (url.includes('/tree/')) return new Response(JSON.stringify([...REQUIRED_PATHS].map((file) => ({ type: 'file', path: file, size: files[file].length, ...(lfs ? { lfs: { oid: crypto.createHash('sha256').update(files[file]).digest('hex') } } : { oid: gitBlobSha1(files[file]) }) }))), { status: 200 })
  const artifact = [...REQUIRED_PATHS].find((file) => url.endsWith(`/${file}`)); if (!artifact) return new Response('', { status: 404 })
  const offset = Number(String(options.headers?.Range || 'bytes=0-').match(/\d+/)?.[0] || 0); return new Response(files[artifact].subarray(offset), { status: offset ? 206 : 200 })
}
test('downloads a pinned manifest, verifies hashes and reports actual total size', async () => {
  const files = fixture(); const store = createWhisperModelStore(root(), fetchFor(files)); const progress = []; const result = await store.download(model, (item) => progress.push(item))
  assert.equal(result.status, 'ready'); assert.equal(result.totalBytes, Object.values(files).reduce((total, file) => total + file.length, 0)); assert.ok(progress.length > 0)
})
test('resumes a partial artifact using a range request', async () => {
  const files = fixture(); const modelRoot = root(); const directory = path.join(modelRoot, model); fs.mkdirSync(path.join(directory, 'onnx'), { recursive: true }); const partial = path.join(directory, 'onnx', 'encoder_model_quantized.onnx.partial'); fs.writeFileSync(partial, files['onnx/encoder_model_quantized.onnx'].subarray(0, 3)); const store = createWhisperModelStore(modelRoot, fetchFor(files)); const result = await store.download(model); assert.equal(result.status, 'ready'); assert.equal(fs.readFileSync(path.join(directory, 'onnx', 'encoder_model_quantized.onnx')).equals(files['onnx/encoder_model_quantized.onnx']), true)
})
test('verifies regular Hugging Face files with their Git blob hash', async () => {
  const files = fixture(); const store = createWhisperModelStore(root(), fetchFor(files, { lfs: false })); const result = await store.download(model)
  assert.equal(result.status, 'ready')
})
test('rejects invalid models and keeps the custom protocol inside the model root', async () => {
  const store = createWhisperModelStore(root(), fetchFor(fixture())); await assert.rejects(() => store.state('Xenova/not-whisper'), /invalide/); assert.equal(store.fileForUrl('whisper-model://models/../../etc/passwd'), null); assert.equal(store.fileForUrl('file:///etc/passwd'), null)
})
