const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const fontkit = require('fontkit');

const MAX_FONT_BYTES = 64 * 1024 * 1024;
const extensions = new Set(['.ttf', '.otf', '.woff', '.woff2']);
const mimeTypes = Object.freeze({
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
});

function createFontLibrary(directory) {
  const metadataFile = path.join(directory, 'library.json');
  const readMetadata = () => {
    try {
      const parsed = JSON.parse(fs.readFileSync(metadataFile, 'utf8'));
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };
  const writeMetadata = (items) => {
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(metadataFile, `${JSON.stringify(items, null, 2)}\n`, { mode: 0o600 });
  };
  const fileFor = (item) => path.join(directory, `${item.id}${item.extension}`);
  const list = () =>
    readMetadata().filter((item) => {
      if (!item || !/^[a-f0-9]{64}$/.test(item.id) || !extensions.has(item.extension)) return false;
      try {
        const stat = fs.lstatSync(fileFor(item));
        return stat.isFile() && !stat.isSymbolicLink();
      } catch {
        return false;
      }
    });
  const importFile = (source) => {
    if (typeof source !== 'string' || !source || !extensions.has(path.extname(source).toLowerCase()))
      throw new Error('Type de police non autorisé');
    let stat;
    try {
      stat = fs.lstatSync(source);
    } catch {
      throw new Error('Police importée invalide');
    }
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Police importée invalide');
    if (stat.size > MAX_FONT_BYTES) throw new Error('La police dépasse la limite de 64 MiB');
    const bytes = fs.readFileSync(source);
    let font;
    try {
      font = fontkit.create(bytes);
    } catch {
      throw new Error('Fichier de police invalide');
    }
    const id = crypto.createHash('sha256').update(bytes).digest('hex');
    const existing = list().find((item) => item.id === id);
    if (existing) return existing;
    const extension = path.extname(source).toLowerCase();
    const item = {
      id,
      family: String(font.familyName || font.fullName || path.basename(source, extension)).slice(0, 200),
      fullName: String(font.fullName || font.familyName || path.basename(source, extension)).slice(0, 200),
      extension,
      url: `project-media://font/${id}`,
    };
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(fileFor(item), bytes, { flag: 'wx', mode: 0o600 });
    writeMetadata([...readMetadata(), item]);
    return item;
  };
  const fileForUrl = (url) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      return null;
    }
    if (parsed.protocol !== 'project-media:' || parsed.hostname !== 'font' || parsed.search || parsed.hash) return null;
    let id;
    try {
      id = decodeURIComponent(parsed.pathname.slice(1));
    } catch {
      return null;
    }
    if (!/^[a-f0-9]{64}$/.test(id)) return null;
    const item = list().find((entry) => entry.id === id);
    return item ? fileFor(item) : null;
  };
  const mimeTypeForUrl = (url) => {
    const item = list().find((entry) => entry.url === url);
    return item ? mimeTypes[item.extension] : null;
  };
  return { list, importFile, fileForUrl, mimeTypeForUrl };
}

module.exports = { createFontLibrary, MAX_FONT_BYTES, extensions, mimeTypes };
