const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createCursorPackLibrary } = require('../../electron/cursors/cursor-pack-library.cjs');

const repositoryRoot = path.resolve(__dirname, '../..');

function repositoryPath(value, expectedBaseName) {
  const resolved = path.resolve(repositoryRoot, value);
  if (!resolved.startsWith(`${repositoryRoot}${path.sep}`) || path.basename(resolved) !== expectedBaseName) {
    throw new Error(`Chemin de génération invalide: ${value}`);
  }
  return resolved;
}

function parsePack(value) {
  const [id, name, sourceDirectory] = value.split('::');
  if (!/^builtin:[a-z0-9-]+$/.test(id || '') || !name || !sourceDirectory) {
    throw new Error(`Pack invalide: ${value}`);
  }
  return { id, name, sourceDirectory: path.resolve(sourceDirectory) };
}

function generate() {
  const [outputArgument, manifestArgument, ...packArguments] = process.argv.slice(2);
  if (!outputArgument || !manifestArgument || packArguments.length === 0) {
    throw new Error(
      'Usage: node scripts/cursors/generate-builtin-packs.cjs public/cursorPacks path/manifest.json "builtin:id::Name::/theme"',
    );
  }
  const outputRoot = repositoryPath(outputArgument, 'cursorPacks');
  const manifestFile = repositoryPath(manifestArgument, 'builtin-cursor-packs.json');
  const packs = packArguments.map(parsePack);
  if (new Set(packs.map((pack) => pack.id)).size !== packs.length) {
    throw new Error('Les identifiants des packs intégrés doivent être uniques');
  }
  const temporaryLibrary = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-builtin-cursors-'));
  const temporaryOutput = fs.mkdtempSync(path.join(path.dirname(outputRoot), '.cursorPacks-'));
  const assetRoot = path.join(temporaryOutput, 'assets');
  fs.mkdirSync(assetRoot, { recursive: true });
  fs.copyFileSync(path.join(__dirname, 'THIRD_PARTY_NOTICES.md'), path.join(temporaryOutput, 'THIRD_PARTY_NOTICES.md'));

  try {
    const library = createCursorPackLibrary(temporaryLibrary);
    const manifest = packs.map(({ id, name, sourceDirectory }) => {
      const imported = library.importDirectory(sourceDirectory);
      const cursors = imported.pack.cursors.map((cursor) => {
        const sourceFile = library.fileForUrl(cursor.url);
        if (!sourceFile || cursor.format !== 'png') throw new Error(`${name}: asset XCursor PNG introuvable`);
        const contents = fs.readFileSync(sourceFile);
        const assetHash = crypto.createHash('sha256').update(contents).digest('hex');
        const filename = `${assetHash}.png`;
        const target = path.join(assetRoot, filename);
        if (!fs.existsSync(target)) fs.copyFileSync(sourceFile, target);
        return { ...cursor, url: `/cursorPacks/assets/${filename}` };
      });
      return {
        id,
        name,
        source: 'builtin',
        colorMode: 'original',
        defaultCursorId: imported.pack.defaultCursorId,
        cursors,
        automaticMap: imported.pack.automaticMap,
      };
    });

    fs.rmSync(outputRoot, { recursive: true, force: true });
    fs.renameSync(temporaryOutput, outputRoot);
    fs.mkdirSync(path.dirname(manifestFile), { recursive: true });
    fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  } catch (error) {
    fs.rmSync(temporaryOutput, { recursive: true, force: true });
    throw error;
  } finally {
    fs.rmSync(temporaryLibrary, { recursive: true, force: true });
  }
}

generate();
