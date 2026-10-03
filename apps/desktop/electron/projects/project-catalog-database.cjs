const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { decodeCursor, validSummary } = require('./project-catalog-page.cjs');
const { openCatalogDatabase } = require('./project-catalog-storage.cjs');

function createCatalogDatabase(root) {
  fs.mkdirSync(root, { recursive: true });
  const file = path.join(root, '.project-catalog.sqlite');
  const db = openCatalogDatabase(file);
  db.exec(`
    CREATE TABLE IF NOT EXISTS catalog (
      key TEXT PRIMARY KEY, id TEXT NOT NULL, name_lower TEXT NOT NULL, updated TEXT NOT NULL,
      source_stamp TEXT NOT NULL, dependency_paths TEXT NOT NULL, dependency_stamp TEXT NOT NULL,
      summary TEXT NOT NULL
    ) STRICT;
    CREATE INDEX IF NOT EXISTS catalog_order ON catalog(updated DESC, id DESC, key DESC);
    CREATE TABLE IF NOT EXISTS catalog_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
  `);
  db.prepare('INSERT OR IGNORE INTO catalog_meta VALUES (?, ?)').run('revision', randomUUID());
  const revision = () => db.prepare('SELECT value FROM catalog_meta WHERE key=?').get('revision').value;
  const get = db.prepare('SELECT * FROM catalog WHERE key=?');
  const upsert = db.prepare(`INSERT INTO catalog VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET id=excluded.id, name_lower=excluded.name_lower, updated=excluded.updated,
    source_stamp=excluded.source_stamp, dependency_paths=excluded.dependency_paths,
    dependency_stamp=excluded.dependency_stamp, summary=excluded.summary`);
  const remove = db.prepare('DELETE FROM catalog WHERE key=?');
  const changeRevision = db.prepare('UPDATE catalog_meta SET value=? WHERE key=?');
  return {
    file,
    get(key) {
      return get.get(key);
    },
    keys() {
      return db
        .prepare('SELECT key FROM catalog')
        .all()
        .map((row) => row.key);
    },
    commit(updates, removed = []) {
      if (!updates.length && !removed.length) return;
      db.exec('BEGIN IMMEDIATE');
      try {
        for (const row of updates) {
          if (!validSummary(row.summary)) throw new TypeError('Invalid project catalogue summary.');
          upsert.run(
            row.key,
            row.summary.id,
            row.summary.name.toLowerCase(),
            row.summary.updatedAt,
            row.sourceStamp,
            JSON.stringify(row.watchPaths),
            row.dependencyStamp,
            JSON.stringify(row.summary),
          );
        }
        for (const key of removed) remove.run(key);
        changeRevision.run(randomUUID(), 'revision');
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    page({ limit, query, cursor }) {
      const decoded = decodeCursor(cursor, query);
      const currentRevision = revision();
      const reset = Boolean(decoded && decoded.revision !== currentRevision);
      const after = reset ? null : decoded?.last;
      const rows = db
        .prepare(`SELECT key, id, updated, summary FROM catalog
        WHERE instr(name_lower, ?) > 0 ${after ? 'AND (updated, id, key) < (?, ?, ?)' : ''}
        ORDER BY updated DESC, id DESC, key DESC LIMIT ?`)
        .all(query, ...(after ?? []), limit + 1);
      const more = rows.length > limit;
      rows.length = Math.min(rows.length, limit);
      const projects = rows.map((row) => {
        const summary = JSON.parse(row.summary);
        if (!validSummary(summary)) throw new Error('Invalid project catalogue index.');
        return summary;
      });
      const last = rows.at(-1);
      return {
        projects,
        total: db.prepare('SELECT count(*) AS total FROM catalog WHERE instr(name_lower, ?) > 0').get(query).total,
        nextCursor: more
          ? Buffer.from(
              JSON.stringify({ revision: currentRevision, query, last: [last.updated, last.id, last.key] }),
            ).toString('base64url')
          : null,
        reset,
      };
    },
    close() {
      db.close();
    },
  };
}
module.exports = { createCatalogDatabase };
