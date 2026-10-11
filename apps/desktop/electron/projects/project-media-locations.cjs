const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { fileURLToPath } = require('node:url');
const PROJECT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
function readProjectId(directory) {
  try {
    const id = JSON.parse(fs.readFileSync(path.join(directory, 'project.json'), 'utf8')).projectId;
    return typeof id === 'string' && PROJECT_ID.test(id) ? id : null;
  } catch {
    return null;
  }
}
function createProjectMediaLocations(root, roots, mediaHost, { projects = () => [] } = {}) {
  const host = (directory) =>
    path.resolve(directory) === path.resolve(root) ? mediaHost : `${mediaHost}-${rootKey(directory)}`;
  const rootFor = (file) =>
    roots()
      .filter((directory) => safePath(directory, path.relative(directory, file)) === path.resolve(file))
      .sort((a, b) => b.length - a.length)[0];
  const projectLocations = new Map();
  const locationKey = (directory, id) => `${path.resolve(directory)}:${id}`;
  const projectForId = (directory, id) => {
    const key = locationKey(directory, id);
    const cached = projectLocations.get(key);
    if (cached && rootFor(cached) === directory && readProjectId(cached) === id) return cached;
    const found = projects().find((candidate) => rootFor(candidate) === directory && readProjectId(candidate) === id);
    if (found) projectLocations.set(key, found);
    else projectLocations.delete(key);
    return found;
  };
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
      if (!directory) return null;
      const resolvedFile = existingFileWithin(directory, file);
      if (!resolvedFile) return null;
      const owner = projects().find(
        (candidate) => rootFor(candidate) === directory && safePath(candidate, path.relative(candidate, file)) === file,
      );
      const id = owner && existingFileWithin(owner, file) && readProjectId(owner);
      let relative;
      if (id) {
        projectLocations.set(locationKey(directory, id), owner);
        relative = `@project/${id}/${path.relative(owner, file).split(path.sep).join('/')}`;
      } else {
        relative = path.relative(fs.realpathSync(directory), resolvedFile).split(path.sep).join('/');
        if (relative.startsWith('@project/')) return null;
      }
      return `project-media://${host(directory)}/${encodeURIComponent(relative)}`;
    },
    mediaFileForUrl(value) {
      try {
        const url = new URL(value);
        if (url.protocol !== 'project-media:') return null;
        const directory = roots().find((directory) => host(directory) === url.hostname);
        if (!directory) return null;
        const relative = decodeURIComponent(url.pathname.slice(1));
        let owner = directory;
        let assetPath = relative;
        if (relative.startsWith('@project/')) {
          const [, id, ...parts] = relative.split('/');
          if (!PROJECT_ID.test(id) || !parts.length) return null;
          owner = projectForId(directory, id);
          if (!owner) return null;
          assetPath = parts.join('/');
        }
        const file = safePath(owner, assetPath);
        return file && existingFileWithin(directory, file) ? existingFileWithin(owner, file) : null;
      } catch {
        return null;
      }
    },
  };
}
module.exports = { createProjectMediaLocations, safePath, rootKey };
