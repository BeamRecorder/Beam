const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const tar = require('tar');

function safeRelative(name) {
  return (
    typeof name === 'string' &&
    !path.posix.isAbsolute(name) &&
    !name.includes('\\') &&
    !name.includes(':') &&
    !name.split('/').includes('..')
  );
}
function verifyRuntime(root) {
  const inventory = JSON.parse(fs.readFileSync(path.join(root, 'inventory.json'), 'utf8'));
  if (inventory.schema_version !== 1 || !Array.isArray(inventory.files) || !inventory.files.length)
    throw new Error('Invalid native runtime inventory');
  for (const item of inventory.files) {
    if (!safeRelative(item.path)) throw new Error('Invalid native runtime inventory path');
    const file = path.join(root, item.path);
    if (!fs.lstatSync(file).isFile()) throw new Error('Runtime inventory entry is not a regular file');
    const digest = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    if (digest !== item.sha256) throw new Error(`Invalid runtime SHA-256: ${item.path}`);
  }
}
function packRuntime(root, destination) {
  verifyRuntime(root);
  tar.c({ gzip: true, sync: true, file: destination, cwd: root, portable: true }, ['.']);
}
async function unpackRuntime(archive, destination) {
  const temporary = `${destination}.${crypto.randomUUID()}.tmp`;
  fs.mkdirSync(temporary, { recursive: true });
  try {
    tar.t({
      file: archive,
      sync: true,
      strict: true,
      onReadEntry: (entry) => {
        if (!safeRelative(entry.path) || !['File', 'Directory'].includes(entry.type))
          throw new Error('Unsafe native runtime archive entry');
      },
    });
    await tar.x({ file: archive, cwd: temporary, strict: true, noChmod: false });
    verifyRuntime(temporary);
    // The verified replacement is complete before the old cache is removed.
    fs.rmSync(destination, { recursive: true, force: true });
    fs.renameSync(temporary, destination);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}
module.exports = { safeRelative, verifyRuntime, packRuntime, unpackRuntime };
