const fs = require('fs');
const path = require('path');
const { safeExportName } = require('./export-file-name.cjs');
const messages = require('../../shared/export-messages.json');

const publications = new Map();

function exportFilePath(directory, name, format, pathModule = path) {
  if (typeof directory !== 'string' || !directory.trim()) throw new Error('Choose an export folder first.');
  return pathModule.resolve(directory, safeExportName(name, format));
}

async function confirmExportReplacement(services, event, filePath, approvedRevision = null) {
  let stat;
  try {
    stat = await (services.fsModule ?? fs).promises.stat(filePath);
  } catch (error) {
    if (error.code === 'ENOENT') return { accepted: true, revision: null };
    throw error;
  }
  if (!stat.isFile()) throw new Error('The export destination is not a file. Choose another filename.');
  const revision = [stat.dev, stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs].join(':');
  if (approvedRevision === revision) return { accepted: true, revision };
  const locale = String(services.getLocale?.() ?? 'en')
    .replaceAll('_', '-')
    .toLowerCase();
  const key = Object.keys(messages).find((key) => key.toLowerCase() === locale);
  const text = messages[key] ?? messages[locale.split('-')[0]] ?? messages.en;
  const { response } = await services.dialog.showMessageBox(services.BrowserWindow.fromWebContents(event.sender), {
    type: 'warning',
    title: text.title,
    message: text.description,
    detail: filePath,
    buttons: [text.replace, text.cancel],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
  });
  return { accepted: response === 0, revision };
}

/** Serialize native publications so simultaneous exports cannot silently overwrite one another. */
async function publishExportFile(services, event, filePath, approvedRevision, publish) {
  const key = process.platform === 'win32' ? filePath.toLowerCase() : filePath;
  const previous = publications.get(key) ?? Promise.resolve();
  const task = previous
    .catch(() => undefined)
    .then(async () => {
      const approval = await confirmExportReplacement(services, event, filePath, approvedRevision);
      if (!approval.accepted) return false;
      await publish();
      return true;
    });
  publications.set(key, task);
  try {
    return await task;
  } finally {
    if (publications.get(key) === task) publications.delete(key);
  }
}

module.exports = { exportFilePath, confirmExportReplacement, publishExportFile };
