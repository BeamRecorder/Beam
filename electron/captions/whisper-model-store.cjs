const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');

const REVISIONS = {
  'Xenova/whisper-tiny': '5332fcc35e32a33b86612b9a57a89be7906102b1',
  'Xenova/whisper-tiny.en': '79fb389fc764e7c395bd330e9531d9d32ada7049',
  'Xenova/whisper-base': '64da57285918e20ea79ea5c88eed7197933abaa8',
  'Xenova/whisper-base.en': '95bf40a508535962c6483ead40270b2e32267508',
  'Xenova/whisper-small': '2d67713f236afa48a18992566e7647f6ca848e13',
  'Xenova/whisper-small.en': 'fa16a75f5d91e83ecb6a2ccb690f14d91ef00ca4',
  'Xenova/whisper-medium': '8c5b90880ab9f79487ab33613413431bf661d595',
  'Xenova/whisper-medium.en': '4fbcf6e6deb6b1af698e6925bfe00730bd4be715',
  'Xenova/whisper-large-v3': '67bf02d92b7754a1ff82a7f8545f8b8c378b2ef0',
};
const REQUIRED_PATHS = new Set([
  'added_tokens.json',
  'config.json',
  'generation_config.json',
  'merges.txt',
  'normalizer.json',
  'preprocessor_config.json',
  'special_tokens_map.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'vocab.json',
  'onnx/encoder_model_quantized.onnx',
  'onnx/decoder_model_merged_quantized.onnx',
]);
const safeTarget = (root, relative) => {
  const target = path.resolve(root, relative);
  return target.startsWith(`${path.resolve(root)}${path.sep}`) ? target : null;
};
const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
};
const createArtifactHash = (artifact) => {
  const hash = crypto.createHash(artifact.hashAlgorithm === 'git-sha1' ? 'sha1' : artifact.hashAlgorithm);
  if (artifact.hashAlgorithm === 'git-sha1') hash.update(`blob ${artifact.size}\0`);
  return hash;
};

function createWhisperModelStore(root, fetchImpl = fetch) {
  const manifests = new Map();
  const activeDownloads = new Map();
  const validModel = (id) => Object.hasOwn(REVISIONS, id);
  const manifestFile = (id) => path.join(root, id, 'manifest.json');
  const fetchManifest = async (id) => {
    if (!validModel(id)) throw new Error('Modèle Whisper invalide.');
    if (manifests.has(id)) return manifests.get(id);

    // Check if we already have local downloaded metadata
    const directory = path.join(root, id);
    const metadata = readJson(manifestFile(id));

    try {
      const response = await fetchImpl(
        `https://huggingface.co/api/models/${id}/tree/${REVISIONS[id]}?recursive=true&expand=true`,
      );
      if (response.ok) {
        const tree = await response.json();
        const artifacts = tree
          .filter((item) => item.type === 'file' && REQUIRED_PATHS.has(item.path))
          .map((item) => ({
            path: item.path,
            size: item.size,
            hash: item.lfs?.oid || item.oid || item.sha || null,
            // Hugging Face exposes regular files as Git blob object ids. Their
            // SHA-1 includes the Git `blob <size>\0` header, unlike LFS oids.
            hashAlgorithm: item.lfs ? 'sha256' : 'git-sha1',
          }));

        if (artifacts.length > 0) {
          const manifest = {
            id,
            revision: REVISIONS[id],
            artifacts,
            totalBytes: artifacts.reduce((total, item) => total + item.size, 0),
          };
          manifests.set(id, manifest);
          return manifest;
        }
      }
    } catch (err) {
      console.warn(`[WhisperStore] Failed to fetch remote manifest for ${id}:`, err);
    }

    // Fallback: If local files exist or offline, construct fallback manifest from directory
    if (metadata && metadata.hashes) {
      const artifacts = Object.entries(metadata.hashes).map(([filePath, meta]) => {
        const file = safeTarget(directory, filePath);
        const size = file && fs.existsSync(file) ? fs.statSync(file).size : 0;
        return {
          path: filePath,
          size,
          hash: meta.value,
          hashAlgorithm: meta.algorithm,
        };
      });
      const manifest = {
        id,
        revision: metadata.revision || REVISIONS[id],
        artifacts,
        totalBytes: metadata.totalBytes || artifacts.reduce((total, item) => total + item.size, 0),
      };
      manifests.set(id, manifest);
      return manifest;
    }

    // Default basic manifest if offline and no cache
    const defaultArtifacts = Array.from(REQUIRED_PATHS).map((p) => ({
      path: p,
      size: 0,
      hash: '',
      hashAlgorithm: 'sha256',
    }));
    const defaultManifest = {
      id,
      revision: REVISIONS[id],
      artifacts: defaultArtifacts,
      totalBytes: 0,
    };
    manifests.set(id, defaultManifest);
    return defaultManifest;
  };
  const state = async (id) => {
    if (!validModel(id)) throw new Error('Modèle Whisper invalide.');
    try {
      const manifest = await fetchManifest(id);
      const directory = path.join(root, id);
      const metadata = readJson(manifestFile(id));
      const downloadedBytes = manifest.artifacts.reduce((total, item) => {
        const file = safeTarget(directory, item.path);
        return total + (file && fs.existsSync(file) ? fs.statSync(file).size : 0);
      }, 0);
      const ready =
        metadata?.revision === manifest.revision &&
        manifest.artifacts.length > 0 &&
        manifest.artifacts.every((item) => {
          const file = safeTarget(directory, item.path);
          const stored = metadata.hashes?.[item.path];
          return (
            file &&
            fs.existsSync(file) &&
            fs.statSync(file).size > 0 &&
            (!stored || stored.value === item.hash || !item.hash)
          );
        });
      return {
        id,
        status: ready ? 'ready' : 'missing',
        downloadedBytes,
        totalBytes: manifest.totalBytes || downloadedBytes,
        revision: manifest.revision,
      };
    } catch {
      return { id, status: 'missing', downloadedBytes: 0, totalBytes: 0, revision: REVISIONS[id] };
    }
  };
  const downloadArtifact = async (id, manifest, artifact, completed, notify) => {
    const directory = path.join(root, id);
    const target = safeTarget(directory, artifact.path);
    if (!target) throw new Error('Chemin de modèle invalide.');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const partial = `${target}.partial`;
    let offset = fs.existsSync(partial) ? fs.statSync(partial).size : 0;
    if (offset > artifact.size) {
      fs.rmSync(partial);
      offset = 0;
    }
    const response = await fetchImpl(`https://huggingface.co/${id}/resolve/${manifest.revision}/${artifact.path}`, {
      headers: offset ? { Range: `bytes=${offset}-` } : {},
    });
    if (!response.ok || !response.body) throw new Error(`Téléchargement Whisper impossible : ${artifact.path}`);
    if (offset && response.status !== 206) {
      fs.rmSync(partial, { force: true });
      return downloadArtifact(id, manifest, artifact, completed, notify);
    }
    const hash = createArtifactHash(artifact);
    if (offset) hash.update(fs.readFileSync(partial));
    let received = offset;
    const source = Readable.fromWeb(response.body);
    source.on('data', (chunk) => {
      received += chunk.length;
      hash.update(chunk);
      notify({
        id,
        status: 'downloading',
        artifact: artifact.path,
        downloadedBytes: completed.value + received,
        totalBytes: manifest.totalBytes,
      });
    });
    await pipeline(source, fs.createWriteStream(partial, { flags: offset ? 'a' : 'w' }));
    if (received !== artifact.size || hash.digest('hex') !== artifact.hash) {
      fs.rmSync(partial, { force: true });
      throw new Error(`Intégrité Whisper invalide : ${artifact.path}`);
    }
    fs.renameSync(partial, target);
    completed.value += artifact.size;
  };
  const performDownload = async (id, notify) => {
    const manifest = await fetchManifest(id);
    const directory = path.join(root, id);
    fs.mkdirSync(directory, { recursive: true });
    const completed = { value: 0 };
    const hashes = {};
    for (const artifact of manifest.artifacts) {
      const target = safeTarget(directory, artifact.path);
      if (target && fs.existsSync(target) && fs.statSync(target).size === artifact.size) {
        const digest = createArtifactHash(artifact).update(fs.readFileSync(target)).digest('hex');
        if (digest === artifact.hash) {
          completed.value += artifact.size;
          hashes[artifact.path] = { algorithm: artifact.hashAlgorithm, value: digest };
          continue;
        }
        fs.rmSync(target);
      }
      await downloadArtifact(id, manifest, artifact, completed, notify);
      hashes[artifact.path] = { algorithm: artifact.hashAlgorithm, value: artifact.hash };
    }
    const metadata = { revision: manifest.revision, hashes, totalBytes: manifest.totalBytes };
    const temporary = `${manifestFile(id)}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(metadata, null, 2)}\n`);
    fs.renameSync(temporary, manifestFile(id));
    return state(id);
  };
  const download = (id, notify = () => {}) => {
    let active = activeDownloads.get(id);
    if (!active) {
      const listeners = new Set();
      const promise = performDownload(id, (progress) => {
        for (const listener of listeners) listener(progress);
      }).finally(() => activeDownloads.delete(id));
      active = { listeners, promise };
      activeDownloads.set(id, active);
    }
    active.listeners.add(notify);
    return active.promise.finally(() => active.listeners.delete(notify));
  };
  const fileForUrl = (url) => {
    const parsed = new URL(url);
    if (parsed.protocol !== 'whisper-model:' || parsed.hostname !== 'models') return null;
    const target = safeTarget(root, decodeURIComponent(parsed.pathname).replace(/^\//, ''));
    return target && fs.existsSync(target) ? target : null;
  };
  return { state, download, fileForUrl, models: Object.keys(REVISIONS) };
}
module.exports = { createWhisperModelStore, REQUIRED_PATHS, REVISIONS };
