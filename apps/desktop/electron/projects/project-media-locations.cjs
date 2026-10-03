const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { fileURLToPath } = require('node:url');

const rootKey = (root) =>
  createHash('sha256')
    .update(process.platform === 'win32' ? path.resolve(root).toLowerCase() : path.resolve(root))
    .digest('hex')
    .slice(0, 24);
function safePath(directory, relativePath) {
  if (typeof relativePath !== 'string' || !relativePath) return null;
  const root = path.resolve(directory);
  const candidate = path.resolve(root, relativePath);
  return candidate === root || candidate.startsWith(`${root}${path.sep}`) ? candidate : null;
}
function existingFileWithin(directory, candidate) {
  try {
    const root = fs.realpathSync(directory);
    const file = fs.realpathSync(candidate);
    return file.startsWith(`${root}${path.sep}`) && fs.statSync(file).isFile() ? file : null;
  } catch {
    return null;
  }
}
function createProjectMediaLocations(root, roots, mediaHost) {
  const host = (directory) =>
    path.resolve(directory) === path.resolve(root) ? mediaHost : `${mediaHost}-${rootKey(directory)}`;
  const rootFor = (file) =>
    roots()
      .filter((directory) => safePath(directory, path.relative(directory, file)) === path.resolve(file))
      .sort((a, b) => b.length - a.length)[0];
  return {
    rootFor,
    mediaUrlFor(fileUrl) {
      let file;
      try {
        file = fileURLToPath(fileUrl);
      } catch {
        return null;
      }
      const directory = rootFor(file);
      if (!directory || !existingFileWithin(directory, file)) return null;
      return `project-media://${host(directory)}/${encodeURIComponent(path.relative(directory, file).split(path.sep).join('/'))}`;
    },
    mediaFileForUrl(value) {
      try {
        const url = new URL(value);
        if (url.protocol !== 'project-media:') return null;
        const directory = roots().find((directory) => host(directory) === url.hostname);
        if (!directory) return null;
        const file = safePath(directory, decodeURIComponent(url.pathname.slice(1)));
        return file ? existingFileWithin(directory, file) : null;
      } catch {
        return null;
      }
    },
  };
}
module.exports = { createProjectMediaLocations, safePath, rootKey };
