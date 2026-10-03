const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');

function openCatalogDatabase(file) {
  const files = [file, `${file}-wal`, `${file}-shm`];
  for (const entry of files) {
    try {
      const stat = fs.lstatSync(entry);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Invalid project catalogue cache file.');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  const open = () => {
    let db;
    try {
      db = new DatabaseSync(file, { timeout: 1000, enableForeignKeyConstraints: true });
      fs.chmodSync(file, 0o600);
      db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA cache_size=-512;');
      return db;
    } catch (error) {
      db?.close();
      throw error;
    }
  };
  try {
    return open();
  } catch (error) {
    // This is a derived index. Rebuild corrupt cache bytes without touching project documents.
    if (error.code !== 'ERR_SQLITE_ERROR' || ![11, 26].includes(error.errcode)) throw error;
    for (const entry of files) fs.rmSync(entry, { force: true });
    return open();
  }
}
module.exports = { openCatalogDatabase };
