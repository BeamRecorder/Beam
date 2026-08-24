const { randomUUID } = require('crypto');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const mediaKinds = new Set(['video', 'image', 'audio']);
const extensions = {
  video: new Set(['.mp4', '.webm', '.mov', '.mkv']),
  image: new Set(['.png', '.jpg', '.jpeg', '.webp']),
  audio: new Set(['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.webm']),
};

const materializeComposition = (directory, composition, sessionFileFor, mediaUrlFor) => ({
  ...composition,
  assets: composition.assets.map((asset) => {
    const target =
      asset.origin === 'session'
        ? sessionFileFor(directory, asset.sessionId, asset.sessionPath)
        : path.join(directory, 'media', asset.fileName);
    const fileUrl = target && fs.existsSync(target) ? pathToFileURL(target).href : null;
    return { ...asset, src: fileUrl ? mediaUrlFor(fileUrl) || '' : '' };
  }),
});

const importMedia = (directory, input) => {
  if (!input || typeof input.source !== 'string' || !mediaKinds.has(input.kind))
    throw new Error('Import de média invalide');
  const extension = path.extname(input.source).toLowerCase();
  if (extension === '.gif') throw new Error('GIF not supported');
  if (!extensions[input.kind].has(extension)) throw new Error('Type de média non autorisé');
  const targetDirectory = path.join(directory, 'media');
  fs.mkdirSync(targetDirectory, { recursive: true });
  const fileName = `${randomUUID()}${extension}`;
  fs.copyFileSync(input.source, path.join(targetDirectory, fileName));
  return {
    id: randomUUID(),
    kind: input.kind,
    name: path.basename(input.source, extension).slice(0, 160),
    fileName,
    durationMs: 0,
    width: null,
    height: null,
    src: pathToFileURL(path.join(targetDirectory, fileName)).href,
    origin: 'project',
  };
};

const pruneProjectMedia = (directory, previous, next) => {
  const used = new Set(next.assets.filter((asset) => asset.origin === 'project').map((asset) => asset.fileName));
  for (const asset of previous.assets || []) {
    if (asset.origin !== 'project' || used.has(asset.fileName)) continue;
    fs.rmSync(path.join(directory, 'media', asset.fileName), { force: true });
  }
};

module.exports = { materializeComposition, importMedia, pruneProjectMedia };
