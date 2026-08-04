const { randomUUID } = require('crypto');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const imageExtensions = new Set(['.avif', '.bmp', '.jpeg', '.jpg', '.png', '.webp']);
const videoExtensions = new Set(['.m4v', '.mov', '.mp4', '.ogv', '.webm']);

const kindFor = (file) => {
  const extension = path.extname(file).toLowerCase();
  if (imageExtensions.has(extension)) return 'image';
  if (videoExtensions.has(extension)) return 'video';
  return null;
};

function createBackgroundLibrary(paths) {
  const directoryFor = (kind) => (kind === 'image' ? paths.wallpaperImages : paths.wallpaperVideos);
  const mediaFor = (file, kind) => ({
    id: `user-wallpaper:${kind}:${file}`,
    name: path.basename(file, path.extname(file)).slice(0, 160),
    fileName: file,
    extension: path.extname(file).slice(1).toLowerCase(),
    kind,
    path: pathToFileURL(path.join(directoryFor(kind), file)).href,
  });
  const list = () =>
    ['image', 'video']
      .flatMap((kind) => {
        const directory = directoryFor(kind);
        if (!fs.existsSync(directory)) return [];
        return fs
          .readdirSync(directory, { withFileTypes: true })
          .filter((entry) => entry.isFile() && kindFor(entry.name) === kind)
          .map((entry) => mediaFor(entry.name, kind));
      })
      .sort((left, right) => left.name.localeCompare(right.name));
  const importFile = (source) => {
    if (typeof source !== 'string' || !source) throw new Error('Fond importé invalide');
    let sourceStats;
    try {
      sourceStats = fs.statSync(source);
    } catch {
      throw new Error('Fond importé invalide');
    }
    if (!sourceStats.isFile()) throw new Error('Fond importé invalide');
    const kind = kindFor(source);
    if (!kind) throw new Error('Type de fond non autorisé');
    const extension = path.extname(source).toLowerCase();
    const targetDirectory = directoryFor(kind);
    fs.mkdirSync(targetDirectory, { recursive: true });
    const fileName = `${randomUUID()}${extension}`;
    fs.copyFileSync(source, path.join(targetDirectory, fileName));
    return mediaFor(fileName, kind);
  };
  return { list, importFile };
}

module.exports = { createBackgroundLibrary, imageExtensions, videoExtensions, kindFor };
