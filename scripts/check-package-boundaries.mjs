import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { builtinModules } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = fileURLToPath(new URL('../', import.meta.url));
const allowed = {
  storage: new Set(['@beam/storage']),
  'native-client': new Set(['@beam/native-client']),
  'system-metrics': new Set(['@beam/system-metrics']),
  'electron-export': new Set(['@beam/electron-export', 'electron']),
  // SVG command normalization is pure geometry; it introduces no browser or native host APIs.
  engine: new Set(['@beam/engine', 'svg-pathdata']),
  runtime: new Set(['@beam/engine', '@beam/runtime', 'mediabunny']),
  encoder: new Set([
    '@beam/engine',
    '@beam/runtime',
    '@beam/encoder',
    '@beam/system-metrics',
    'mediabunny',
    '@mediabunny/aac-encoder',
  ]),
};
const failures = [];
let checked = 0;
function walk(directory, visit) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory() && entry.name !== 'tests') walk(filename, visit);
    else if (
      entry.isFile() &&
      ['.ts', '.js', '.cjs', '.cts'].some((extension) => entry.name.endsWith(extension)) &&
      !entry.name.includes('.test.')
    )
      visit(filename);
  }
}
for (const [name, dependencies] of Object.entries(allowed)) {
  const directory = path.join(root, 'packages', name, 'src');
  walk(directory, (filename) => {
    checked += 1;
    const source = readFileSync(filename, 'utf8');
    const file = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
    if (source.split('\n').length > 501) failures.push(`${filename}: exceeds 500 lines`);
    const inspect = (node) => {
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      )
        check(node.moduleSpecifier.text);
      if (
        ts.isCallExpression(node) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) && node.expression.text === 'require')) &&
        ts.isStringLiteral(node.arguments[0])
      )
        check(node.arguments[0].text);
      if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal))
        check(node.argument.literal.text);
      if (
        name === 'engine' &&
        ts.isIdentifier(node) &&
        ['window', 'document', 'navigator', 'FontFace', 'OffscreenCanvas', 'HTMLCanvasElement'].includes(node.text)
      ) {
        // Properties/parameters named document are ordinary domain data.
        if (!['document'].includes(node.text)) failures.push(`${filename}: browser global ${node.text}`);
      }
      ts.forEachChild(node, inspect);
    };
    const check = (specifier) => {
      if (specifier.startsWith('.')) {
        const destination = path.resolve(path.dirname(filename), specifier);
        if (!destination.startsWith(directory + path.sep))
          failures.push(`${filename}: relative import escapes package: ${specifier}`);
        return;
      }
      if (
        (name === 'native-client' ||
          name === 'electron-export' ||
          (name === 'storage' && filename.includes(path.sep + 'node' + path.sep))) &&
        builtinModules.includes(specifier.replace(/^node:/, ''))
      )
        return;
      if (![...dependencies].some((dependency) => specifier === dependency || specifier.startsWith(dependency + '/'))) {
        failures.push(`${filename}: forbidden dependency ${specifier}`);
      }
    };
    inspect(file);
  });
}
for (const application of ['desktop', 'cli']) {
  const directory = path.join(root, 'apps', application);
  const checkSize = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (['node_modules', 'dist', 'tests'].includes(entry.name)) continue;
      const filename = path.join(directory, entry.name);
      if (entry.isDirectory()) checkSize(filename);
      else if (
        /\.(ts|js|cjs|vue)$/.test(entry.name) &&
        !entry.name.includes('.test.') &&
        !entry.name.endsWith('.d.ts')
      ) {
        if (readFileSync(filename, 'utf8').split('\n').length > 501) failures.push(`${filename}: exceeds 500 lines`);
      }
    }
  };
  checkSize(directory);
}
if (failures.length) {
  process.stderr.write(failures.join('\n') + '\n');
  process.exitCode = 1;
} else process.stdout.write(`Checked ${checked} package sources: dependency boundaries and file sizes pass.\n`);
