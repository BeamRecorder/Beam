const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

function parseJson(file, source) {
  try {
    return JSON.parse(source);
  } catch (error) {
    if (error instanceof SyntaxError) error.message = `Invalid JSON at ${file}: ${error.message}`;
    throw error;
  }
}

function readJsonSync(file, { fsModule = fs } = {}) {
  return parseJson(file, fsModule.readFileSync(file, 'utf8'));
}

async function readJson(file, { fsModule = fs } = {}) {
  return parseJson(file, await fsModule.promises.readFile(file, 'utf8'));
}

function prepareBatch(entries, pretty) {
  const unique = new Map();
  for (const entry of entries) unique.set(path.resolve(entry.file), entry);
  return [...unique].map(([file, entry]) => {
    const source = JSON.stringify(entry.value, null, (entry.pretty ?? pretty) ? 2 : undefined);
    if (source === undefined) throw new TypeError(`JSON document at ${file} is undefined.`);
    return { file, source: `${source}\n`, temporary: `${file}.${process.pid}.${randomUUID()}.tmp`, cleanup: false };
  });
}

function cleanupSync(entries, fsModule, errors) {
  for (const { temporary, cleanup } of entries) {
    if (!cleanup) continue;
    try {
      fsModule.unlinkSync(temporary);
    } catch (error) {
      if (error.code !== 'ENOENT') errors.push(error);
    }
  }
  if (errors.length === 1) throw errors[0];
  if (errors.length) throw new AggregateError(errors, 'JSON batch failed, including temporary-file cleanup.');
}

// All documents serialize and stage before any destination is replaced. Each
// replacement is atomic; a multi-file batch is not a filesystem transaction.
function writeJsonBatchSync(entries, { fsModule = fs, pretty = true } = {}) {
  const prepared = prepareBatch(entries, pretty);
  const errors = [];
  try {
    for (const directory of new Set(prepared.map(({ file }) => path.dirname(file)))) {
      fsModule.mkdirSync(directory, { recursive: true });
    }
    for (const entry of prepared) {
      const { source, temporary } = entry;
      entry.cleanup = true;
      try {
        fsModule.writeFileSync(temporary, source, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
      } catch (error) {
        if (error.code === 'EEXIST') entry.cleanup = false;
        throw error;
      }
    }
    for (const entry of prepared) {
      fsModule.renameSync(entry.temporary, entry.file);
      entry.cleanup = false;
    }
  } catch (error) {
    errors.push(error);
  }
  cleanupSync(prepared, fsModule, errors);
}

function writeJsonAtomicSync(file, value, options) {
  writeJsonBatchSync([{ file, value }], options);
}

async function stageBatch(entries, fsModule) {
  let next = 0;
  const directories = new Map();
  const outcomes = await Promise.allSettled(
    Array.from({ length: Math.min(4, entries.length) }, async () => {
      while (next < entries.length) {
        const entry = entries[next++];
        const { file, source, temporary } = entry;
        const directory = path.dirname(file);
        let ready = directories.get(directory);
        if (!ready) {
          ready = fsModule.promises.mkdir(directory, { recursive: true });
          directories.set(directory, ready);
        }
        await ready;
        entry.cleanup = true;
        try {
          await fsModule.promises.writeFile(temporary, source, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
        } catch (error) {
          if (error.code === 'EEXIST') entry.cleanup = false;
          throw error;
        }
      }
    }),
  );
  const errors = outcomes.filter((outcome) => outcome.status === 'rejected').map((outcome) => outcome.reason);
  if (errors.length === 1) throw errors[0];
  if (errors.length) throw new AggregateError(errors, 'Unable to stage JSON batch.');
}

async function writeJsonBatch(entries, { fsModule = fs, pretty = true } = {}) {
  const prepared = prepareBatch(entries, pretty);
  const errors = [];
  try {
    await stageBatch(prepared, fsModule);
    for (const entry of prepared) {
      await fsModule.promises.rename(entry.temporary, entry.file);
      entry.cleanup = false;
    }
  } catch (error) {
    errors.push(error);
  }
  for (const { temporary, cleanup } of prepared) {
    if (!cleanup) continue;
    try {
      await fsModule.promises.unlink(temporary);
    } catch (error) {
      if (error.code !== 'ENOENT') errors.push(error);
    }
  }
  if (errors.length === 1) throw errors[0];
  if (errors.length) throw new AggregateError(errors, 'JSON batch failed, including temporary-file cleanup.');
}

async function writeJsonAtomic(file, value, options) {
  await writeJsonBatch([{ file, value }], options);
}

module.exports = { readJson, readJsonSync, writeJsonAtomic, writeJsonAtomicSync, writeJsonBatch, writeJsonBatchSync };
