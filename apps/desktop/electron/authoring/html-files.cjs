const fs = require('node:fs');
const path = require('node:path');
const { validateHtmlComposition } = require('../../../../packages/engine/src/html/html-schema.js');

const MAX_BYTES = 128 * 1024 * 1024;
const MAX_FILES = 2048;
function copyTree(source, destination) {
  let bytes = 0,
    files = 0;
  const visit = (from, to) => {
    const stat = fs.lstatSync(from);
    if (stat.isSymbolicLink()) throw new Error('Composition files cannot contain symbolic links.');
    if (stat.isDirectory()) {
      fs.mkdirSync(to, { recursive: true });
      for (const name of fs.readdirSync(from)) {
        if (['node_modules', '.git', '.beam', 'dist'].includes(name)) continue;
        visit(path.join(from, name), path.join(to, name));
      }
    } else {
      if (!stat.isFile() || ++files > MAX_FILES || (bytes += stat.size) > MAX_BYTES)
        throw new Error('Composition source exceeds the file or size limit.');
      fs.copyFileSync(from, to, fs.constants.COPYFILE_EXCL);
    }
  };
  visit(source, destination);
}

function createHtmlFiles({ projectStore, screenshotStore }) {
  const projectDirectory = (context) =>
    context.kind === 'image'
      ? screenshotStore.directoryFor(context.projectId)
      : projectStore.directoryFor(context.projectId);
  const directoryFor = (context, html) => {
    validateHtmlComposition(html);
    const root = fs.realpathSync(projectDirectory(context));
    const candidate = path.join(root, 'html', html.id, html.revision);
    const real = fs.realpathSync(candidate);
    if (!real.startsWith(root + path.sep)) throw new Error('Invalid HTML composition directory.');
    return real;
  };
  const fileFor = (context, html, relative, tree = 'dist') => {
    const root = fs.realpathSync(path.join(directoryFor(context, html), tree));
    const candidate = path.resolve(root, relative);
    if (!candidate.startsWith(root + path.sep)) throw new Error('Invalid composition path.');
    const real = fs.realpathSync(candidate);
    if (!real.startsWith(root + path.sep) || !fs.statSync(real).isFile()) throw new Error('Invalid composition file.');
    return real;
  };
  const stage = (context, input) => {
    validateHtmlComposition(input.html);
    if (context.kind === 'image' && input.html.durationMs !== 0)
      throw new Error('Screenshot compositions must be static (durationMs: 0).');
    for (const key of ['sourceDirectory', 'bundleDirectory'])
      if (typeof input[key] !== 'string' || !path.isAbsolute(input[key])) throw new Error(`Invalid ${key}.`);
    const root = fs.realpathSync(projectDirectory(context));
    const directory = path.join(root, 'html', input.html.id, input.html.revision);
    // Create each component explicitly: an existing symlink must never redirect a write.
    let current = root;
    for (const part of ['html', input.html.id]) {
      current = path.join(current, part);
      if (!fs.existsSync(current)) fs.mkdirSync(current);
      if (!fs.lstatSync(current).isDirectory() || fs.lstatSync(current).isSymbolicLink())
        throw new Error('Invalid composition directory.');
    }
    fs.mkdirSync(directory);
    try {
      copyTree(input.sourceDirectory, path.join(directory, 'source'));
      copyTree(input.bundleDirectory, path.join(directory, 'dist'));
      fileFor(context, input.html, input.html.entry);
      fileFor(context, input.html, input.html.entry, 'source');
      return { ...input.html };
    } catch (error) {
      fs.rmSync(directory, { recursive: true, force: true });
      throw error;
    }
  };
  return { stage, fileFor, directoryFor, projectDirectory };
}
module.exports = { createHtmlFiles, copyTree };
