const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { dimensions: validDimensions, validateScreenshotState } = require('./screenshot-validation.cjs');
const { validateScreenshotHistory } = require('./screenshot-history.cjs');
const { importMedia, importImageBuffer } = require('../projects/composition-project-media.cjs');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const screenshotName = (value) => {
  const name = String(value ?? '').trim();
  if (!name || name.length > 200) throw new Error('Invalid screenshot name.');
  return name;
};

function createScreenshotStore(root) {
  const directory = (id) => {
    if (typeof id !== 'string' || !UUID.test(id)) throw new Error('Invalid screenshot identifier.');
    const target = path.join(root, id);
    if (fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink())
      throw new Error('Invalid screenshot directory.');
    return target;
  };
  const write = (id, document) => {
    const target = path.join(directory(id), 'screenshot.json');
    const temporary = `${target}.${randomUUID()}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify({ ...document, updatedAt: new Date().toISOString() }), {
      flag: 'wx',
      mode: 0o600,
    });
    try {
      fs.renameSync(temporary, target);
    } finally {
      fs.rmSync(temporary, { force: true });
    }
  };
  const read = (id) => {
    const metadata = path.join(directory(id), 'screenshot.json');
    const stat = fs.lstatSync(metadata);
    if (!stat.isFile()) throw new Error('Invalid screenshot metadata.');
    const document = JSON.parse(fs.readFileSync(metadata, 'utf8'));
    if (document.id !== id || document.schemaVersion !== 1 || !validDimensions(document.width, document.height))
      throw new Error('Invalid screenshot document.');
    if (document.state) validateScreenshotState(document.state, id);
    try {
      validateScreenshotHistory(document.history, document.state, id);
    } catch {
      // A damaged optional history must never hide an otherwise editable project.
      delete document.history;
    }
    return {
      ...document,
      createdAt: document.createdAt || stat.birthtime.toISOString(),
      updatedAt: document.updatedAt || stat.mtime.toISOString(),
      source: `project-media://screenshot/${id}/source.png`,
    };
  };
  return {
    read,
    directoryFor: directory,
    importImage(id, source) {
      read(id);
      const asset = importMedia(directory(id), { kind: 'image', source });
      return { ...asset, src: `project-media://screenshot/${id}/media/${asset.fileName}` };
    },
    importClipboardImage(id, input) {
      read(id);
      const asset = importImageBuffer(directory(id), input);
      return { ...asset, src: `project-media://screenshot/${id}/media/${asset.fileName}` };
    },
    discardImage(id, source) {
      const document = read(id);
      const prefix = `project-media://screenshot/${id}/media/`;
      if (typeof source !== 'string' || !source.startsWith(prefix)) throw new Error('Invalid screenshot image.');
      const fileName = source.slice(prefix.length);
      if (!/^[0-9a-f-]{36}\.(png|jpg|jpeg|webp)$/.test(fileName)) throw new Error('Invalid screenshot image.');
      // Undo/redo snapshots own their media too. Only unfinished imports can be discarded.
      if (JSON.stringify(document).includes(JSON.stringify(source))) return;
      const mediaDirectory = path.join(directory(id), 'media');
      if (fs.lstatSync(mediaDirectory).isSymbolicLink()) throw new Error('Invalid screenshot media directory.');
      fs.rmSync(path.join(mediaDirectory, fileName), { force: true });
    },
    rename(id, name) {
      write(id, { ...read(id), name: screenshotName(name) });
      return read(id);
    },
    create() {
      const id = randomUUID();
      fs.mkdirSync(directory(id), { recursive: true });
      return { id, path: path.join(directory(id), 'source.png') };
    },
    complete(id, dimensions, preset, name) {
      if (!validDimensions(dimensions.width, dimensions.height)) throw new Error('Invalid screenshot dimensions.');
      const createdAt = new Date().toISOString();
      write(id, {
        schemaVersion: 1,
        createdAt,
        id,
        name: name === undefined ? `Screenshot ${createdAt}` : screenshotName(name),
        width: dimensions.width,
        height: dimensions.height,
        preset,
        state: null,
      });
      return read(id);
    },
    remove(id) {
      fs.rmSync(directory(id), { recursive: true, force: true });
    },
    save(id, state, history) {
      const document = read(id);
      validateScreenshotState(state, id);
      validateScreenshotHistory(history, state, id);
      write(id, { ...document, state, history });
    },
    list() {
      if (!fs.existsSync(root)) return [];
      return fs
        .readdirSync(root)
        .filter((id) => UUID.test(id))
        .flatMap((id) => {
          try {
            return [read(id)];
          } catch {
            return [];
          }
        })
        .sort((a, b) => b.name.localeCompare(a.name));
    },
    fileForUrl(value) {
      try {
        const url = new URL(value);
        const match = /^\/([^/]+)\/(source\.png|media\/[0-9a-f-]{36}\.(?:png|jpg|jpeg|webp))$/.exec(url.pathname);
        if (url.protocol !== 'project-media:' || url.hostname !== 'screenshot' || !match) return null;
        const file = path.join(directory(match[1]), match[2]);
        if (match[2].startsWith('media/') && fs.lstatSync(path.dirname(file)).isSymbolicLink()) return null;
        return fs.lstatSync(file).isFile() ? file : null;
      } catch {
        return null;
      }
    },
  };
}

module.exports = { createScreenshotStore };
