const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const atomicJson = (file, value) => {
  fs.writeFileSync(`${file}.tmp`, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(`${file}.tmp`, file);
};

function rewriteProjectReferences(directory, root, previous) {
  const oldRelative = path.relative(root, previous).split(path.sep).join('/');
  const newRelative = path.relative(root, directory).split(path.sep).join('/');
  const prefixes = [
    [pathToFileURL(previous).href + '/', pathToFileURL(directory).href + '/'],
    [previous + path.sep, directory + path.sep],
    [
      `project-media://asset/${encodeURIComponent(oldRelative + '/')}`,
      `project-media://asset/${encodeURIComponent(newRelative + '/')}`,
    ],
  ];
  const replace = (value) => {
    if (typeof value === 'string') {
      for (const [from, to] of prefixes) if (value.startsWith(from)) return to + value.slice(from.length);
      return value;
    }
    if (Array.isArray(value)) return value.map(replace);
    if (value && typeof value === 'object')
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replace(item)]));
    return value;
  };
  const visit = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const file = path.join(current, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile() && entry.name.endsWith('.json')) {
        const original = JSON.parse(fs.readFileSync(file, 'utf8'));
        const next = replace(original);
        if (JSON.stringify(next) !== JSON.stringify(original)) atomicJson(file, next);
      }
    }
  };
  visit(directory);
}

function organizeProjectCategories(root) {
  fs.mkdirSync(root, { recursive: true });
  const studio = path.join(root, 'studio');
  for (const category of ['studio', 'instant', 'screenshot']) {
    const directory = path.join(root, category);
    fs.mkdirSync(directory, { recursive: true });
    if (fs.lstatSync(directory).isSymbolicLink()) throw new Error('Project category cannot be a symbolic link.');
  }
  const journal = path.join(root, '.category-migration.json');
  let entries;
  if (fs.existsSync(journal)) entries = JSON.parse(fs.readFileSync(journal, 'utf8'));
  else {
    const reserved = new Set(fs.readdirSync(studio));
    entries = fs
      .readdirSync(root, { withFileTypes: true })
      .filter(
        (entry) =>
          entry.isDirectory() &&
          !['studio', 'instant', 'screenshot'].includes(entry.name) &&
          fs.existsSync(path.join(root, entry.name, 'project.json')),
      )
      .map((entry) => {
        let target = entry.name;
        for (let suffix = 2; reserved.has(target); suffix++) target = `${entry.name}-${suffix}`;
        reserved.add(target);
        return { source: entry.name, target };
      });
    if (!entries.length) return;
    atomicJson(journal, entries);
  }
  if (
    !Array.isArray(entries) ||
    entries.some(
      (entry) =>
        !entry ||
        ['studio', 'instant', 'screenshot'].includes(entry.source) ||
        ['source', 'target'].some(
          (key) =>
            typeof entry[key] !== 'string' ||
            !entry[key] ||
            entry[key] !== path.basename(entry[key]) ||
            entry[key] === '.' ||
            entry[key] === '..',
        ),
    )
  )
    throw new Error('Invalid project migration journal.');
  for (const entry of entries) {
    const source = path.join(root, entry.source);
    const target = path.join(studio, entry.target);
    if (fs.existsSync(source)) {
      if (fs.lstatSync(source).isSymbolicLink() || fs.existsSync(target))
        throw new Error('Project migration destination is occupied.');
      fs.renameSync(source, target);
    }
    if (fs.lstatSync(target).isSymbolicLink()) throw new Error('Invalid project migration destination.');
    rewriteProjectReferences(target, root, source);
  }
  fs.unlinkSync(journal);
}

module.exports = { organizeProjectCategories, rewriteProjectReferences };
